const axios = require('axios');

// AutoEnhance.ai API configuration
const API_KEY = process.env.AUTOENHANCE_API_KEY;
const BASE_URL = 'https://api.autoenhance.ai/v3';

// Helper function to generate unique ID
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substring(7);
}

// Parse multipart form data manually
function parseMultipart(body, boundary) {
    const parts = [];
    const fields = {};

    // Split by boundary
    const rawParts = body.split(boundary).filter(part => part.includes('Content-Disposition'));

    for (const rawPart of rawParts) {
        const headerEnd = rawPart.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const headers = rawPart.substring(0, headerEnd);
        let content = rawPart.substring(headerEnd + 4);

        // Remove trailing \r\n--
        if (content.endsWith('--\r\n')) {
            content = content.slice(0, -4);
        } else if (content.endsWith('\r\n')) {
            content = content.slice(0, -2);
        }

        // Parse Content-Disposition
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);

        if (nameMatch) {
            const name = nameMatch[1];

            if (filenameMatch) {
                // It's a file
                parts.push({
                    fieldname: name,
                    filename: filenameMatch[1],
                    buffer: Buffer.from(content, 'binary')
                });
            } else {
                // It's a field
                fields[name] = content.trim();
            }
        }
    }

    return { files: parts, fields };
}

// Helper function to wait for image processing
async function waitForProcessing(imageId, maxAttempts = 60) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await axios.get(`${BASE_URL}/images/${imageId}`, {
            headers: { 'x-api-key': API_KEY }
        });

        console.log(`Image ${imageId} status:`, response.data.status);

        if (response.data.status === 'processed') {
            return response.data;
        }

        if (response.data.status === 'failed') {
            throw new Error('Image processing failed');
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Processing timeout');
}

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    if (!API_KEY) {
        console.error('API key not configured');
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'API key not configured. Set AUTOENHANCE_API_KEY environment variable.' })
        };
    }

    try {
        // Get content type and boundary
        const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)$/);

        if (!boundaryMatch) {
            console.error('No boundary found in content-type:', contentType);
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid content type - no boundary' })
            };
        }

        const boundary = '--' + boundaryMatch[1];

        // Decode body
        let bodyStr;
        if (event.isBase64Encoded) {
            bodyStr = Buffer.from(event.body, 'base64').toString('binary');
        } else {
            bodyStr = event.body;
        }

        // Parse multipart data
        const { files, fields } = parseMultipart(bodyStr, boundary);

        console.log('Parsed files:', files.length);
        console.log('Parsed fields:', fields);

        const mode = fields.mode || 'triple';
        const expectedCount = mode === 'single' ? 1 : 3;

        if (files.length !== expectedCount) {
            console.error(`Expected ${expectedCount} files, got ${files.length}`);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: `Please upload exactly ${expectedCount} image${expectedCount > 1 ? 's' : ''}`,
                    received: files.length
                })
            };
        }

        const enhancementStyle = fields.preset || 'natural';
        const orderId = generateId();

        console.log('Starting HDR merge process...');
        console.log('Mode:', mode);
        console.log('Order ID:', orderId);
        console.log('Enhancement style:', enhancementStyle);

        const imageIds = [];

        // Register and upload each image
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageId = generateId();

            console.log(`Processing image ${i + 1}/${files.length}... (${file.buffer.length} bytes)`);

            // Register the image
            const registerResponse = await axios.post(`${BASE_URL}/images`, {
                image_id: imageId,
                order_id: orderId,
                image_name: mode === 'single' ? 'image.jpg' : `bracket_${i + 1}.jpg`,
                content_type: 'image/jpeg'
            }, {
                headers: {
                    'x-api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const uploadUrl = registerResponse.data.s3PutObjectUrl;
            console.log('Image registered, uploading...');

            // Upload the image file to S3
            await axios.put(uploadUrl, file.buffer, {
                headers: { 'Content-Type': 'image/jpeg' }
            });

            console.log(`Image ${i + 1} uploaded successfully`);
            imageIds.push(imageId);
        }

        // Process the order with HDR
        const bracketsPerImage = mode === 'single' ? 1 : 3;
        console.log(`Processing order with ${bracketsPerImage} bracket(s)...`);

        await axios.post(`${BASE_URL}/orders/${orderId}/process`, {
            number_of_brackets_per_image: bracketsPerImage,
            enhancement_style: enhancementStyle,
            enable_window_pull: true,
            enable_vertical_correction: true,
            enable_lens_correction: true
        }, {
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        // Wait for processing
        console.log('Waiting for order processing...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        const orderResponse = await axios.get(`${BASE_URL}/orders/${orderId}`, {
            headers: { 'x-api-key': API_KEY }
        });

        console.log('Order response:', JSON.stringify(orderResponse.data));

        // Find the processed image
        let processedImageId;
        if (orderResponse.data.images && orderResponse.data.images.length > 0) {
            processedImageId = orderResponse.data.images[0].image_id;
        } else {
            processedImageId = imageIds[0];
        }

        console.log('Waiting for image processing:', processedImageId);
        await waitForProcessing(processedImageId);

        // Download the enhanced image
        console.log('Downloading enhanced image...');
        const enhancedResponse = await axios.get(
            `${BASE_URL}/images/${processedImageId}/enhanced?preview=false&watermark=false`,
            {
                headers: { 'x-api-key': API_KEY },
                responseType: 'arraybuffer'
            }
        );

        console.log('HDR merge completed successfully!');

        // Return the image as base64
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Disposition': 'attachment; filename="hdr-enhanced.jpg"',
                'Access-Control-Allow-Origin': '*'
            },
            body: Buffer.from(enhancedResponse.data).toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Error details:', error.response?.data || error.stack);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to process HDR merge',
                details: error.response?.data || error.message
            })
        };
    }
};
