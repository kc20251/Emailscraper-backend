import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  UseGuards, 
  Req, 
  Delete,
  Put 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmailService } from './email.service';

@Controller('email')
@UseGuards(AuthGuard('jwt'))
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('smtp-configs')
  async createSMTPConfig(@Req() req, @Body() configData: any) {
    const config = await this.emailService.createSMTPConfig(req.user.userId, configData);
    return { success: true, config };
  }

  @Get('smtp-configs')
  async getSMTPConfigs(@Req() req) {
    const configs = await this.emailService.getUserSMTPConfigs(req.user.userId);
    return configs;
  }

  @Get('smtp-configs/:id')
  async getSMTPConfig(@Req() req, @Param('id') configId: string) {
    const config = await this.emailService.getSMTPConfig(configId, req.user.userId);
    return config;
  }

  @Put('smtp-configs/:id')
  async updateSMTPConfig(
    @Req() req, 
    @Param('id') configId: string,
    @Body() updateData: any
  ) {
    const config = await this.emailService.updateSMTPConfig(configId, req.user.userId, updateData);
    return { success: true, config };
  }

  @Delete('smtp-configs/:id')
  async deleteSMTPConfig(@Req() req, @Param('id') configId: string) {
    await this.emailService.deleteSMTPConfig(configId, req.user.userId);
    return { success: true, message: 'SMTP configuration deleted' };
  }

  @Post('smtp-configs/:id/test')
  async testSMTPConfig(@Req() req, @Param('id') configId: string) {
    return await this.emailService.verifySMTPConfig(configId);
  }

  @Post('templates')
  async createTemplate(@Req() req, @Body() templateData: any) {
    const template = await this.emailService.createTemplate(req.user.userId, templateData);
    return { success: true, template };
  }

  @Get('templates')
  async getTemplates(@Req() req) {
    const templates = await this.emailService.getUserTemplates(req.user.userId);
    return templates;
  }

  @Get('templates/:id')
  async getTemplate(@Req() req, @Param('id') templateId: string) {
    const template = await this.emailService.getTemplate(templateId, req.user.userId);
    return template;
  }

  @Put('templates/:id')
  async updateTemplate(
    @Req() req,
    @Param('id') templateId: string,
    @Body() updateData: any
  ) {
    const template = await this.emailService.updateTemplate(templateId, req.user.userId, updateData);
    return { success: true, template };
  }

  @Delete('templates/:id')
  async deleteTemplate(@Req() req, @Param('id') templateId: string) {
    await this.emailService.deleteTemplate(templateId, req.user.userId);
    return { success: true, message: 'Template deleted' };
  }

  @Post('send-test')
  async sendTestEmail(
    @Req() req,
    @Body() body: { smtpConfigId: string; to: string; subject: string; body: string }
  ) {
    const result = await this.emailService.sendEmail(body.smtpConfigId, {
      to: body.to,
      subject: body.subject,
      html: body.body,
    });
    
    return {
      success: result.success,
      message: result.success ? 'Test email sent successfully' : `Failed to send email: ${result.error}`,
      messageId: result.messageId,
    };
  }
}