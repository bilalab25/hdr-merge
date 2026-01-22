# HDR Merge Web App - AutoEnhance.ai

A web application that uses AutoEnhance.ai's advanced AI to merge bracketed exposure images into stunning, professional-quality HDR photos.

## Features

- Upload 1 or 3 JPEG images (bracketed exposures)
- AI-powered HDR merging and enhancement
- Multiple enhancement styles (Natural, Vibrant, Warm, Authentic)
- Advanced features:
  - Window enhancement
  - Vertical correction
  - Lens correction
- Live preview of the merged HDR image
- Download the final result

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will automatically find an available port (starting from 3001) and display the URL.

### 3. Use the App

1. Open your browser and go to the URL shown (e.g., `http://localhost:3001`)
2. Choose HDR mode:
   - **Single Image HDR** - Upload 1 image for AI enhancement
   - **3-Image HDR Merge** - Upload 3 bracketed exposures for professional HDR
3. Choose an enhancement style:
   - **Natural** - Clean, balanced look (recommended for interiors)
   - **Vibrant** - Enhanced colors and contrast
   - **Warm** - Warmer tones
   - **Authentic** - True-to-life colors
4. Click "Create HDR Merge"
5. Wait for processing (1-2 minutes)
6. Preview and download your enhanced HDR image

## How It Works

1. **Register Images** - Creates image entries for each uploaded photo
2. **Upload to Cloud** - Uploads image data to secure cloud storage
3. **HDR Processing** - Groups the images and applies AI-powered HDR merging
4. **Enhancement** - Applies tone mapping, window pull, and corrections
5. **Final Result** - Returns the professional-quality HDR image

## Requirements

- Node.js (v14 or higher)
- AutoEnhance.ai API key (configured in server-autoenhance.js)
- JPEG images

## Tech Stack

- **Backend**: Node.js, Express, Multer, Axios
- **Frontend**: HTML, CSS, JavaScript
- **API**: AutoEnhance.ai

## Configuration

The API key is configured in `server-autoenhance.js`. Keep your API key secure and never commit it to public repositories.

## Processing Time

- **HDR Processing**: 1-2 minutes
- Depends on server load and image size
- The app automatically polls for completion

## Troubleshooting

If you encounter errors:
1. Check that all images are valid JPEG files
2. Ensure images are from bracketed exposures of the same scene (for 3-image mode)
3. Try a different enhancement style
4. Check the server console for detailed error messages

## Credits

Powered by [AutoEnhance.ai](https://autoenhance.ai/) - Advanced AI image enhancement service
