import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { AppConfigService } from '../config/app-config.service';
import { RegisterDto } from './dto/register.dto';
import { parseDurationMs } from './duration';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

// Same message and status for "no such email" and "wrong password" - a
// different answer for each would tell a caller which emails are
// registered.
const INVALID_CREDENTIALS = 'Invalid email or password';
const INVALID_REFRESH_TOKEN = 'Invalid refresh token';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  private argonOptions(): { memoryCost: number; timeCost: number } {
    return this.config.argon2;
  }

  // Refresh tokens are looked up by their hash, so the hash must be
  // deterministic - unlike argon2's password hashes, which embed a fresh
  // salt every call and are compared with verify(), never by equality.
  // A plain SHA-256 is the right tool here (not a slow hash): the input
  // is already a 384-bit random secret, not a guessable password, so
  // hashing speed isn't the defense - the token's entropy is.
  private hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private sanitize(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.usersRepository.findOneBy({ email: dto.email });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(dto.password, this.argonOptions());
    const user = this.usersRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });
    const saved = await this.usersRepository.save(user);
    return this.sanitize(saved);
  }

  private async issueTokenPair(
    user: User,
    familyId: string,
    manager: EntityManager = this.refreshTokensRepository.manager,
  ): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      {
        secret: this.config.jwt.secret,
        expiresIn: this.config.jwt.accessExpiresIn,
      },
    );

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const ttlMs = parseDurationMs(this.config.jwt.refreshExpiresIn);

    const refreshToken = manager.create(RefreshToken, {
      user,
      tokenHash: this.hashRefreshToken(rawRefreshToken),
      familyId,
      expiresAt: new Date(Date.now() + ttlMs),
      revokedAt: null,
    });
    await manager.save(refreshToken);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.usersRepository.findOneBy({ email });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueTokenPair(user, crypto.randomUUID());
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const existing = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: { user: true },
    });
    if (!existing) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    if (existing.revokedAt !== null) {
      // Reuse of an already-rotated token means two parties now hold the
      // same secret - the legitimate client and, potentially, a thief.
      // There's no way to tell which one just called, so every refresh
      // token this user holds is revoked, not just this one's family.
      await this.refreshTokensRepository.update(
        { user: { id: existing.user.id } },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    // The database row is the only source of truth for expiry - these
    // are opaque random tokens, not JWTs, so there's no second "the
    // token's own exp" to disagree with it.
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    return this.refreshTokensRepository.manager.transaction(async (manager) => {
      await manager.update(
        RefreshToken,
        { id: existing.id },
        { revokedAt: new Date() },
      );
      return this.issueTokenPair(existing.user, existing.familyId, manager);
    });
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    // Idempotent and silent either way: whether the token was never
    // valid or already used, the caller learns nothing beyond "you are
    // now logged out."
    await this.refreshTokensRepository.update(
      { tokenHash },
      { revokedAt: new Date() },
    );
  }
}
