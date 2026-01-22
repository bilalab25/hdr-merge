const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Your Photomatix API key
const API_KEY = 'Vxrsfhwpqzp6mGVrb9jfY7fc6OnrvuGf';

// Endpoint to process HDR merge
app.post('/api/merge-hdr', upload.array('images', 3), async (req, res) => {
    try {
        if (!req.files || req.files.length !== 3) {
            return res.status(400).json({ error: 'Please upload exactly 3 images' });
        }

        const preset = req.body.preset || 'Natural';
        console.log('Step 1: Creating HDR engine...');
        console.log('Using preset:', preset);

        // Step 1: Create HDR engine
        const engineResponse = await axios.post('https://api.hdrsoft.com/hdrengines', null, {
            headers: {
                'x-pm-token': API_KEY
            },
            params: {
                type: 'multi',
                alignment: 'yes',
                'noise-reduction': 'normal-underexposed',
                deghosting: 'on',
                'output-bit-depth': 8
            }
        });

        // Get the relative location path from response body
        const engineLocation = engineResponse.data.data.location;
        const baseUrl = 'https://api.hdrsoft.com';
        console.log('Engine created:', engineLocation);

        // Step 2: Upload images to engine
        console.log('Step 2: Uploading images...');
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const fileName = `image${i + 1}.jpg`;

            // Create form data
            const formData = new FormData();
            formData.append('image', fs.createReadStream(file.path));

            await axios.post(`${baseUrl}${engineLocation}/images/${fileName}`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'x-pm-token': API_KEY
                }
            });

            console.log(`Uploaded ${fileName}`);
        }

        // Step 3: Process and merge
        console.log('Step 3: Processing HDR merge...');
        const processResponse = await axios.post(`${baseUrl}${engineLocation}/process`, null, {
            headers: {
                'x-pm-token': API_KEY
            },
            params: {
                preset: preset,
                format: 'jpg'
            },
            responseType: 'arraybuffer'
        });

        // Clean up uploaded files
        req.files.forEach(file => {
            fs.unlinkSync(file.path);
        });

        // Send the processed image back
        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'attachment; filename="hdr-merged.jpg"'
        });
        res.send(Buffer.from(processResponse.data));

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
        console.log(`HDR Merge Web App running on http://localhost:${port}`);
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
