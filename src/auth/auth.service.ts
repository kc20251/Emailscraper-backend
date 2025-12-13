import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { User, UserDocument } from '../schemas/user.schema';
import { getIdString } from '../common/utils';

export interface RegisterDto {
  email: string;
  password: string;
  username: string;
  company?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    _id: string;
    email: string;
    username: string;
    role: string;
    subscription: any;
    whitelabel?: any;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Method called by AuthController.login
  async validateUser(usernameOrEmail: string, password: string): Promise<any> {
    const user = await this.userModel.findOne({
      $or: [
        { email: usernameOrEmail },
        { username: usernameOrEmail }
      ]
    });

    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Remove password from response
    const { password: _, ...result } = user.toObject();
    return result;
  }

  // Method called by AuthController.getUserById
  async getUserById(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('-password');
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: getIdString(user._id),
      _id: getIdString(user._id),
      email: user.email,
      username: user.username,
      role: user.role,
      subscription: user.subscription,
      whitelabel: user.whitelabel,
      lastLogin: user.lastLogin,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Check if user exists
    const existingUser = await this.userModel.findOne({ 
      $or: [{ email: registerDto.email }, { username: registerDto.username }] 
    });

    if (existingUser) {
      throw new HttpException('User already exists', HttpStatus.BAD_REQUEST);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user with free trial subscription
    const newUser = new this.userModel({
      ...registerDto,
      password: hashedPassword,
      role: 'user',
      subscription: {
        plan: 'free',
        status: 'trial',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
        limits: {
          dailyEmails: 100,
          totalCollections: 3,
          emailTemplates: 5,
          campaigns: 2,
          smtpConfigs: 1,
        },
      },
      whitelabel: {
        enabled: false,
      },
    });

    await newUser.save();

    // Generate token
    const token = this.generateToken(newUser);

    return {
      token,
      user: {
        _id: getIdString(newUser._id),
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        subscription: newUser.subscription,
        whitelabel: newUser.whitelabel,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.userModel.findOne({ email: loginDto.email });

    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const isValidPassword = await bcrypt.compare(loginDto.password, user.password);

    if (!isValidPassword) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = this.generateToken(user);

    return {
      token,
      user: {
        _id: getIdString(user._id),
        email: user.email,
        username: user.username,
        role: user.role,
        subscription: user.subscription,
        whitelabel: user.whitelabel,
      },
    };
  }

  // This method is called by the login controller above
  async loginWithUser(user: any): Promise<AuthResponse> {
    const token = this.generateToken(user);
    
    return {
      token,
      user: {
        _id: getIdString(user._id),
        email: user.email,
        username: user.username,
        role: user.role,
        subscription: user.subscription,
        whitelabel: user.whitelabel,
      },
    };
  }

  private generateToken(user: any): string {
    return jwt.sign(
      {
        userId: getIdString(user._id),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
  }

  async validateToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      return decoded;
    } catch (error) {
      return null;
    }
  }

  async createSuperAdmin(): Promise<void> {
    // Check if super admin exists
    const superAdmin = await this.userModel.findOne({ role: 'super-admin' });
    
    if (!superAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const adminUser = new this.userModel({
        email: 'admin@emailscraper.com',
        username: 'superadmin',
        password: hashedPassword,
        role: 'super-admin',
        subscription: {
          plan: 'enterprise',
          status: 'active',
          limits: {
            dailyEmails: 10000,
            totalCollections: 100,
            emailTemplates: 100,
            campaigns: 50,
            smtpConfigs: 10,
          },
        },
        whitelabel: {
          enabled: true,
          brandName: 'EmailScraper Pro',
          customColors: {
            primary: '#3B82F6',
            secondary: '#8B5CF6',
          },
        },
      });

      await adminUser.save();
      console.log('Super admin created:', adminUser.email);
    }
  }
}