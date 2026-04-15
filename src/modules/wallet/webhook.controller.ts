import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WalletService } from './wallet.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private wallet: WalletService) {}

  @Public()
  @Post('payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment provider webhook' })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  async paymentWebhook(
    @Req() req: RawBodyRequest,
    @Body() _body: unknown,
    @Headers('x-chapa-signature') signature: string | undefined,
  ): Promise<{ success: true }> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(_body ?? {}));
    await this.wallet.processWebhook(raw, signature);
    return { success: true };
  }
}
