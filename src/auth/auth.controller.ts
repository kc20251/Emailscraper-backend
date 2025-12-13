import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    username: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('login')
  async login(@Body() loginDto: { email: string; password: string }) {
    try {
      // First validate the user
      const user = await this.authService.validateUser(
        loginDto.email,
        loginDto.password,
      );

      // Then login with the validated user
      const result = await this.authService.loginWithUser(user);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      return { 
        success: false, 
        message: error.message || 'Invalid credentials' 
      };
    }
  }

  @Post('register')
  async register(@Body() registerDto: { 
    email: string; 
    password: string; 
    username: string; 
    company?: string 
  }) {
    try {
      const result = await this.authService.register(registerDto);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Registration failed',
      };
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('validate')
  async validate(@Req() req: any) {
    try {
      console.log('🔐 /auth/validate endpoint called');
      console.log('👤 Request user:', req.user);
      console.log('📋 Request headers authorization:', req.headers.authorization ? 'Present' : 'Missing');

      if (!req.user) {
        console.log('❌ No user in request - AuthGuard failed');
        return { valid: false };
      }

      console.log('🔍 Getting user by ID:', req.user.userId);
      const user = await this.authService.getUserById(req.user.userId);

      console.log('✅ Token valid for user:', user.username);
      return {
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          lastLogin: user.lastLogin,
        }
      };
    } catch (error) {
      console.log('❌ Token validation failed:', error.message);
      return { valid: false };
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.getUserById(req.user.userId);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      lastLogin: user.lastLogin,
      subscription: user.subscription,
      whitelabel: user.whitelabel,
    };
  }

  @Get('debug-headers')
  debugHeaders(@Req() req: any) {
    console.log('🔍 Debug headers endpoint called');
    console.log('📋 Authorization header:', req.headers.authorization);
    console.log('📋 All headers:', req.headers);
    
    return {
      authorizationHeader: req.headers.authorization,
      hasAuthHeader: !!req.headers.authorization,
      allHeaders: req.headers
    };
  }
}