// backend/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'defaultSecretKey',
    });
    console.log('🔑 JWT Strategy initialized successfully');
  }

 async validate(payload: any) {
    console.log('🎯 JWT Strategy validate() called with payload:', payload);
    
    // Your auth.service puts userId, email, role in the payload
    return {
      userId: payload.userId,  // ← FIXED: Use payload.userId (not payload.sub)
      email: payload.email,    // ← FIXED: Your payload has email, not username
      role: payload.role
    };
  }
}