const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// AutoEnhance.ai API key
const API_KEY = 'ec4c1065-7399-45d2-84b0-6129ff404a05';
const BASE_URL = 'https://api.autoenhance.ai/v3';

// Helper function to generate unique ID
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substring(7);
}

// Helper function to wait/poll for image processing
async function waitForProcessing(imageId, maxAttempts = 60) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await axios.get(`${BASE_URL}/images/${imageId}`, {
            headers: {
                'x-api-key': API_KEY
            }
        });

        console.log(`Image ${imageId} status:`, response.data.status);

        if (response.data.status === 'processed') {
            return response.data;
        }

        if (response.data.status === 'failed') {
            throw new Error('Image processing failed');
        }

        // Wait 5 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Processing timeout - image took too long to process');
}

// Endpoint to process HDR merge
app.post('/api/merge-hdr', upload.array('images', 3), async (req, res) => {
    try {
        const mode = req.body.mode || 'triple'; // 'single' or 'triple'
        const expectedCount = mode === 'single' ? 1 : 3;

        if (!req.files || req.files.length !== expectedCount) {
            return res.status(400).json({ error: `Please upload exactly ${expectedCount} image${expectedCount > 1 ? 's' : ''}` });
        }

        const enhancementStyle = req.body.preset || 'natural';
        const orderId = generateId();
        console.log('Starting HDR merge process...');
        console.log('Mode:', mode);
        console.log('Order ID:', orderId);
        console.log('Enhancement style:', enhancementStyle);

        const imageIds = [];

        // Step 1 & 2: Register and upload each image
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const imageId = generateId();

            console.log(`\nProcessing image ${i + 1}/${req.files.length}...`);

            // Register the image
            console.log('Registering image...');
            const registerResponse = await axios.post(`${BASE_URL}/images`, {
                image_id: imageId,
                order_id: orderId,
                image_name: mode === 'single' ? `image.jpg` : `bracket_${i + 1}.jpg`,
                content_type: 'image/jpeg'
            }, {
                headers: {
                    'x-api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const uploadUrl = registerResponse.data.s3PutObjectUrl;
            console.log('Image registered, uploading file...');

            // Upload the image file to S3
            const fileData = fs.readFileSync(file.path);
            await axios.put(uploadUrl, fileData, {
                headers: {
                    'Content-Type': 'image/jpeg'
                }
            });

            console.log(`Image ${i + 1} uploaded successfully`);
            imageIds.push(imageId);
        }

        // Step 3: Process the order with HDR
        const bracketsPerImage = mode === 'single' ? 1 : 3;
        console.log(`\nProcessing order with HDR (${bracketsPerImage} bracket${bracketsPerImage > 1 ? 's' : ''})...`);
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

        console.log('Order processing started, waiting for completion...');

        // Step 4: Wait for processing to complete
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds for grouping

        const orderResponse = await axios.get(`${BASE_URL}/orders/${orderId}`, {
            headers: {
                'x-api-key': API_KEY
            }
        });

        console.log('Order images:', orderResponse.data.images);

        // Find the processed image (should be the merged HDR result)
        let processedImageId;
        if (orderResponse.data.images && orderResponse.data.images.length > 0) {
            processedImageId = orderResponse.data.images[0].image_id;
        } else {
            processedImageId = imageIds[0];
        }

        console.log('Waiting for image processing:', processedImageId);
        await waitForProcessing(processedImageId);

        // Step 5: Download the enhanced image from AutoEnhance
        console.log('Downloading enhanced image from AutoEnhance...');
        const enhancedResponse = await axios.get(
            `${BASE_URL}/images/${processedImageId}/enhanced?preview=false&watermark=false`,
            {
                headers: {
                    'x-api-key': API_KEY
                },
                responseType: 'arraybuffer'
            }
        );

        // Clean up uploaded files
        req.files.forEach(file => {
            fs.unlinkSync(file.path);
        });

        // Send the enhanced image back
        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'attachment; filename="hdr-enhanced.jpg"'
        });
        res.send(Buffer.from(enhancedResponse.data));

        console.log('HDR merge completed successfully!');

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);

        // Clean up files on error
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        res.status(500).json({
            error: 'Failed to process HDR merge',
            details: error.response?.data || error.message
        });
    }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Function to start server with automatic port fallback
function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`HDR Merge Web App (AutoEnhance.ai) running on http://localhost:${port}`);
        console.log(`Open your browser and go to: http://localhost:${port}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is already in use, trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
            process.exit(1);
        }
    });
}

startServer(PORT);
