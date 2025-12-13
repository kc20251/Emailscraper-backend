import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Put,
  Param,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('subscription')
@UseGuards(AuthGuard('jwt')) 
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Get all subscription plans
  @Get('plans')
  async getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  // Get user's current subscription
  @Get()
  async getSubscription(@Request() req) {
    return this.subscriptionService.getUserSubscription(req.user.userId);
  }

  // Get usage statistics
  @Get('usage')
  async getUsage(@Request() req) {
    return this.subscriptionService.getUsageStats(req.user.userId);
  }

  // Upgrade subscription
  @Post('upgrade')
  async upgradeSubscription(
    @Request() req,
    @Body() upgradeDto: { plan: string; paymentMethodId?: string },
  ) {
    return this.subscriptionService.upgradePlan(
      req.user.userId,
      upgradeDto.plan,
      upgradeDto.paymentMethodId,
    );
  }

  // Cancel subscription
  @Post('cancel')
  async cancelSubscription(@Request() req, @Body() cancelDto?: { reason?: string }) {
    return this.subscriptionService.cancelSubscription(
      req.user.userId,
      cancelDto?.reason,
    );
  }

  // Update billing information
  @Put('billing')
  async updateBilling(@Request() req, @Body() billingInfo: any) {
    return this.subscriptionService.updateBillingInfo(
      req.user.userId,
      billingInfo,
    );
  }

  // Get invoice history
  @Get('invoices')
  async getInvoices(@Request() req) {
    return this.subscriptionService.getInvoiceHistory(req.user.userId);
  }

  // Get specific invoice
  @Get('invoices/:invoiceId')
  async getInvoice(@Param('invoiceId') invoiceId: string, @Request() req) {
    return this.subscriptionService.getInvoice(req.user.userId, invoiceId);
  }

  // Update payment method
  @Put('payment-method')
  async updatePaymentMethod(@Request() req, @Body() paymentData: any) {
    return this.subscriptionService.updatePaymentMethod(
      req.user.userId,
      paymentData,
    );
  }
}