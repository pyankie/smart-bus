import { PrismaClient } from '@prisma-generated/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../src/prisma/prisma.service';

export type MockPrismaService = DeepMockProxy<PrismaClient>;

export const createMockPrisma = (): MockPrismaService => {
  const mock = mockDeep<PrismaClient>();

  // Mock the $transaction method specifically since PrismaClient extends it
  mock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(mock);
    }
    return Promise.all(arg);
  });

  return mock as unknown as MockPrismaService;
};

export const MockPrismaProvider = {
  provide: PrismaService,
  useFactory: createMockPrisma,
};
