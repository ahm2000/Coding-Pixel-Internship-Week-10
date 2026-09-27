import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';

const CONFIG: Record<string, string> = {
  JWT_SECRET: 'test-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '15m',
};

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: { findOneBy: jest.Mock };
  let refreshTokensRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    manager: { transaction: jest.Mock; create: jest.Mock; save: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    usersRepository = { findOneBy: jest.fn() };
    refreshTokensRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      manager: {
        transaction: jest.fn(),
        create: jest.fn((_entity, data) => data),
        save: jest.fn(async (data) => data),
      },
    };
    jwtService = { sign: jest.fn(() => 'signed-access-token') };
    configService = { get: jest.fn((key: string) => CONFIG[key]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokensRepository,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('accepts the right password and returns a token pair', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        memoryCost: 1024,
        timeCost: 2,
      });
      usersRepository.findOneBy.mockResolvedValue({
        id: 1,
        email: 'alice@example.com',
        passwordHash,
      });

      const result = await service.login(
        'alice@example.com',
        'correct-password',
      );

      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('rejects a wrong password with 401', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        memoryCost: 1024,
        timeCost: 2,
      });
      usersRepository.findOneBy.mockResolvedValue({
        id: 1,
        email: 'alice@example.com',
        passwordHash,
      });

      await expect(
        service.login('alice@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email with the same message as a wrong password', async () => {
      usersRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.login('nobody@example.com', 'whatever'),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refresh', () => {
    function tokenRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
      return {
        id: 1,
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 1, email: 'alice@example.com' } as User,
        ...overrides,
      } as RefreshToken;
    }

    it('revokes the old refresh token row and issues a new pair (rotation)', async () => {
      refreshTokensRepository.findOne.mockResolvedValue(tokenRow());
      const managerUpdate = jest.fn();
      refreshTokensRepository.manager.transaction.mockImplementation(
        (cb: (m: unknown) => unknown) =>
          cb({
            update: managerUpdate,
            create: jest.fn((_entity, data) => data),
            save: jest.fn(async (data) => data),
          }),
      );

      const result = await service.refresh('some-raw-token');

      expect(managerUpdate).toHaveBeenCalledWith(
        RefreshToken,
        { id: 1 },
        { revokedAt: expect.any(Date) },
      );
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('rejects an unknown token with 401', async () => {
      refreshTokensRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired-but-never-revoked token with 401 (X2)', async () => {
      refreshTokensRepository.findOne.mockResolvedValue(
        tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        refreshTokensRepository.manager.transaction,
      ).not.toHaveBeenCalled();
    });

    it("revokes every one of the user's refresh tokens when a revoked token is reused (X1)", async () => {
      refreshTokensRepository.findOne.mockResolvedValue(
        tokenRow({
          revokedAt: new Date(),
          user: { id: 42, email: 'bob@example.com' } as User,
        }),
      );

      await expect(service.refresh('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepository.update).toHaveBeenCalledWith(
        { user: { id: 42 } },
        { revokedAt: expect.any(Date) },
      );
    });
  });

  describe('logout', () => {
    it('revokes the presented token by its hash', async () => {
      await service.logout('some-raw-token');

      const expectedHash = crypto
        .createHash('sha256')
        .update('some-raw-token')
        .digest('hex');
      expect(refreshTokensRepository.update).toHaveBeenCalledWith(
        { tokenHash: expectedHash },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
