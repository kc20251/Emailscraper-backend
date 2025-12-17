import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'https://boldmind-lead-gen.netlify.app',
      'http://localhost:3000'
    ],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Welcome page endpoint
  app.use('/', (req, res, next) => {
    if (req.path === '/') {
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EmailScraper Pro API</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    margin-top: 50px;
                }
                h1 {
                    color: #333;
                    border-bottom: 2px solid #4CAF50;
                    padding-bottom: 10px;
                }
                .endpoints {
                    margin-top: 20px;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                }
                .endpoint {
                    margin: 10px 0;
                    padding: 10px;
                    background: white;
                    border-left: 4px solid #4CAF50;
                    border-radius: 3px;
                }
                a {
                    color: #4CAF50;
                    text-decoration: none;
                    font-weight: bold;
                }
                a:hover {
                    text-decoration: underline;
                }
                .status {
                    color: #28a745;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 EmailScraper Pro API</h1>
                <p class="status">✅ Server is running successfully!</p>
                <p>Welcome to the EmailScraper Pro API service. This API provides email marketing and scraping capabilities.</p>
                
                <div class="endpoints">
                    <h3>📚 Available Endpoints:</h3>
                    <div class="endpoint">
                        <strong>API Documentation:</strong> 
                        <a href="/api-docs" target="_blank">/api-docs</a>
                        <br>
                        <em>Swagger UI for API exploration and testing</em>
                    </div>
                    <div class="endpoint">
                        <strong>Health Check:</strong> 
                        <a href="/health" target="_blank">/health</a>
                        <br>
                        <em>Check API server status</em>
                    </div>
                    <div class="endpoint">
                        <strong>API Base URL:</strong> 
                        <a href="/api" target="_blank">/api</a>
                        <br>
                        <em>Base endpoint for all API routes</em>
                    </div>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <h3>🔧 Technical Information:</h3>
                    <p><strong>Server Time:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
                    <p><strong>Port:</strong> ${process.env.PORT || 3001}</p>
                </div>
            </div>
        </body>
        </html>
      `);
    } else {
      next();
    }
  });

  // Health check endpoint
  app.use('/health', (req, res, next) => {
    if (req.path === '/' || req.path === '') {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'EmailScraper Pro API',
        version: '1.0.0',
        uptime: process.uptime()
      });
    } else {
      next();
    }
  });

  // API base endpoint
  app.use('/api', (req, res, next) => {
    if (req.path === '/' || req.path === '') {
      res.json({
        message: 'EmailScraper Pro API',
        version: '1.0.0',
        endpoints: {
          documentation: '/api-docs',
          health: '/health',
          auth: '/api/auth',
          jobs: '/api/jobs',
          scraping: '/api/scraping',
          // Add other endpoints as needed
        }
      });
    } else {
      next();
    }
  });

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('EmailScraper Pro API')
    .setDescription('Email marketing and scraping API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'EmailScraper Pro API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`
===============================================
🚀 EmailScraper Pro API Server Started!
===============================================
✅ Server URL: http://localhost:${port}
📚 Swagger Docs: http://localhost:${port}/api-docs
🔧 Health Check: http://localhost:${port}/health
📊 API Base: http://localhost:${port}/api
===============================================
  `);
}

bootstrap();