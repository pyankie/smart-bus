import { Body, Controller, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.users.findById(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Patch('me/fcm-token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register or refresh FCM device token for push notifications' })
  @ApiResponse({ status: 204, description: 'Token registered' })
  updateFcmToken(@CurrentUser() user: JwtPayload, @Body() dto: UpdateFcmTokenDto) {
    return this.users.updateFcmToken(user.sub, dto.token);
  }
}
