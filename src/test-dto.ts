import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ValidateTicketDto } from './modules/validation/dto/validate-ticket.dto';

const parsed1 = plainToInstance(ValidateTicketDto, {
  qrPayload: 'test',
  qrSignature: 'test',
  inspectionMode: 'true'
}, { enableImplicitConversion: true });

console.log('parsed1:', parsed1);
console.log('parsed1 inspectionMode type:', typeof parsed1.inspectionMode);

const parsed2 = plainToInstance(ValidateTicketDto, {
  qrPayload: 'test',
  qrSignature: 'test',
  inspectionMode: true
}, { enableImplicitConversion: true });

console.log('parsed2:', parsed2);
console.log('parsed2 inspectionMode type:', typeof parsed2.inspectionMode);
