import axios from 'axios';

const API_BASE = 'http://localhost:3001';

async function testEndpoints() {
  console.log('🚀 Testing EmailScraper Pro API Endpoints\n');

  const tests = [
    {
      name: 'Auth - Register',
      method: 'POST',
      url: `${API_BASE}/auth/register`,
      data: {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        company: 'Test Company'
      },
      expect: 201
    },
    {
      name: 'Auth - Login',
      method: 'POST',
      url: `${API_BASE}/auth/login`,
      data: {
        email: 'test@example.com',
        password: 'password123'
      },
      expect: 200
    },
    {
      name: 'Collections - Get',
      method: 'GET',
      url: `${API_BASE}/collections`,
      headers: { Authorization: '' }, // Will be filled after login
      expect: 200
    },
    {
      name: 'Campaigns - Create',
      method: 'POST',
      url: `${API_BASE}/campaigns`,
      data: {
        name: 'Test Campaign',
        description: 'Test campaign description',
        templateId: 'template_id_here',
        smtpConfigId: 'smtp_id_here',
        collectionIds: ['collection_id_here']
      },
      headers: { Authorization: '' },
      expect: 201
    }
  ];

  let authToken = '';

  for (const test of tests) {
    try {
      console.log(`📋 ${test.name}...`);
      
      const config: any = {
        method: test.method,
        url: test.url,
        headers: test.headers || {}
      };

      if (test.data) {
        config.data = test.data;
      }

      if (authToken && !test.headers?.Authorization) {
        config.headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await axios(config);
      
      if (response.status === test.expect) {
        console.log(`✅ ${test.name}: SUCCESS (${response.status})\n`);
        
        // Store token from login
        if (test.name === 'Auth - Login' && response.data?.token) {
          authToken = response.data.token;
          console.log(`🔑 Token received: ${authToken.substring(0, 20)}...\n`);
        }
      } else {
        console.log(`❌ ${test.name}: FAILED (Expected ${test.expect}, got ${response.status})\n`);
      }
    } catch (error: any) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}\n`);
      if (error.response?.data) {
        console.log('   Response:', error.response.data, '\n');
      }
    }
  }

  console.log('🎯 Testing complete!');
}

testEndpoints();