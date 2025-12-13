import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  Patch,
  Delete,
  ParseIntPipe,
  DefaultValuePipe 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super-admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return await this.adminService.getUsers({ page, limit, search, role });
  }

  @Get('users/:id')
  async getUser(@Param('id') userId: string) {
    return await this.adminService.getUser(userId);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body('role') role: string,
    @GetUser('_id') adminId: string,
  ) {
    return await this.adminService.updateUserRole(userId, role, adminId);
  }

  @Patch('users/:id/subscription')
  async updateUserSubscription(
    @Param('id') userId: string,
    @Body() updateData: any,
  ) {
    return await this.adminService.updateUserSubscription(userId, updateData);
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') userId: string,
    @GetUser('_id') adminId: string,
  ) {
    return await this.adminService.deleteUser(userId, adminId);
  }

  @Get('analytics')
  async getAnalytics(
    @Query('period') period: string = '30d',
  ) {
    return await this.adminService.getAnalytics(period);
  }

  @Get('stats')
  async getStats() {
    return await this.adminService.getStats();
  }

  @Post('whitelabel/:userId/enable')
  async enableWhitelabel(
    @Param('userId') userId: string,
    @Body() whitelabelData: any,
  ) {
    return await this.adminService.enableWhitelabel(userId, whitelabelData);
  }

  @Post('whitelabel/:userId/disable')
  async disableWhitelabel(@Param('userId') userId: string) {
    return await this.adminService.disableWhitelabel(userId);
  }

  @Get('system/health')
  async getSystemHealth() {
    return await this.adminService.getSystemHealth();
  }
}