const axios = require('axios');

async function testConnection() {
    try {
        console.log('Testing connection to LLM server...');
        const response = await axios.post('http://127.0.0.1:1234', {
            model: 'codeqwen1.5-7b-chat',
            messages: [
                {
                    role: 'user',
                    content: 'Hello'
                }
            ]
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Response:', response.data);
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            response: error.response?.data,
            config: {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers,
                data: error.config?.data
            }
        });
    }
}

testConnection();
