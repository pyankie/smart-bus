import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentifierType, Prisma, User, UserRole, UserStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Fields never returned in responses
const EXCLUDED_FIELDS = { passwordHash: true } as const;
type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateUserDto): Promise<SafeUser> {
    this.validateRoleFidCoupling(dto.role, dto.fid);
    const normalizedEmail = this.normalizeEmail(dto.email);

    try {
      return await this.prisma.user.create({
        data: {
          role: dto.role,
          fullName: dto.fullName,
          phone: dto.phone,
          email: normalizedEmail,
          passwordHash: dto.passwordHash,
          fid: dto.fid,
          ...(dto.role === UserRole.PASSENGER ? { wallet: { create: { balance: 0 } } } : {}),
        },
        omit: EXCLUDED_FIELDS,
      });
    } catch (error: unknown) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async findById(id: string, includeDeleted = false): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: EXCLUDED_FIELDS,
    });

    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  async findByPhone(phone: string, includeDeleted = false): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      omit: EXCLUDED_FIELDS,
    });

    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  async findByEmail(email: string, includeDeleted = false): Promise<SafeUser | null> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      omit: EXCLUDED_FIELDS,
    });

    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  async findByFid(fid: string, includeDeleted = false): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { fid },
      omit: EXCLUDED_FIELDS,
    });

    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  async findByIdentifier(
    identifier: string,
    type: IdentifierType,
    includeDeleted = false,
  ): Promise<SafeUser | null> {
    switch (type) {
      case IdentifierType.PHONE:
        return this.findByPhone(identifier, includeDeleted);
      case IdentifierType.EMAIL:
        return this.findByEmail(identifier, includeDeleted);
      case IdentifierType.FID:
        return this.findByFid(identifier, includeDeleted);
      default:
        return null;
    }
  }

  async findAuthByIdentifier(
    identifier: string,
    type: IdentifierType,
    includeDeleted = false,
  ): Promise<User | null> {
    switch (type) {
      case IdentifierType.PHONE:
        return this.findAuthByPhone(identifier, includeDeleted);
      case IdentifierType.EMAIL:
        return this.findAuthByEmail(identifier, includeDeleted);
      case IdentifierType.FID:
        return this.findAuthByFid(identifier, includeDeleted);
      default:
        return null;
    }
  }

  // ─── Updates ───────────────────────────────────────────────────────────────

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<SafeUser> {
    await this.requireUser(id);
    const normalizedEmail = this.normalizeEmail(dto.email);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: { ...dto, ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}) },
        omit: EXCLUDED_FIELDS,
      });
    } catch (error: unknown) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async updateStatus(id: string, status: UserStatus): Promise<SafeUser> {
    await this.requireUser(id, true);
    return this.prisma.user.update({ where: { id }, data: { status }, omit: EXCLUDED_FIELDS });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.requireUser(id);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  // ─── Soft delete / restore ─────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    await this.requireUser(id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async restore(id: string): Promise<SafeUser> {
    const user = await this.findById(id, true);
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      omit: EXCLUDED_FIELDS,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validateRoleFidCoupling(role: UserRole, fid?: string): void {
    // FID is required for passengers (UC0001), optional for drivers/admins
    // All roles can use FID as a login identifier (UC0002) and for password reset (UC0004)
    if (role === UserRole.PASSENGER && !fid) {
      throw new BadRequestException('FID is required for PASSENGER accounts');
    }
  }

  private async requireUser(id: string, includeDeleted = false): Promise<SafeUser> {
    const user = await this.findById(id, includeDeleted);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
    if (error.code !== 'P2002') return;

    const targets = Array.isArray(error.meta?.target)
      ? error.meta.target.map(String)
      : [String(error.meta?.target ?? '')];

    if (targets.some((t) => t.includes('phone'))) {
      throw new ConflictException('Phone number already registered');
    }
    if (targets.some((t) => t.includes('email'))) {
      throw new ConflictException('Email address already in use');
    }
    if (targets.some((t) => t.includes('fid'))) {
      throw new ConflictException('FID already registered');
    }

    throw new ConflictException('Unique constraint violation');
  }

  private async findAuthByPhone(phone: string, includeDeleted: boolean): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  private async findAuthByEmail(email: string, includeDeleted: boolean): Promise<User | null> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  private async findAuthByFid(fid: string, includeDeleted: boolean): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { fid } });
    if (!includeDeleted && user?.deletedAt) return null;
    return user;
  }

  private normalizeEmail(email?: string): string | undefined {
    if (!email) return undefined;
    return email.trim().toLowerCase();
  }
}
