# Aura AI Authentication Backend

A production-ready authentication service built with **Node.js, Express, and MongoDB** that supports both **Google OAuth** and **Email + OTP** login.

## Features

### 🔐 Security First
- **JWT Authentication** - Stateless token-based authentication
- **HTTP-Only Cookies** - Secure token storage (XSS protection)
- **Helmet.js** - HTTP headers security
- **Rate Limiting** - Global and endpoint-specific protection
- **Bcrypt Hashing** - OTP and sensitive data encryption
- **Input Validation** - Express-validator for all inputs
- **CORS Protection** - Strict origin validation
- **NoSQL Injection Prevention** - Safe database queries
- **Brute Force Protection** - OTP attempt limits + automatic blocking

### 🔑 Authentication Methods

#### Google OAuth
- Verify Google ID tokens on backend
- Auto-create user on first login
- Mark as verified immediately
- Seamless integration with frontend

#### Email + OTP
- 6-digit random OTP generation
- 5-minute expiration time
- Max 5 verification attempts
- 15-minute auto-block after failed attempts
- 60-second resend cooldown
- HTML email templates with verification links
- Post-verification success email

### 📧 Email Service
- **Nodemailer** integration (Gmail SMTP compatible)
- HTML email templates
- OTP delivery
- Verification success notifications

### 🛡️ Rate Limiting
- **Global**: 100 requests/15 min
- **Auth Routes**: 10 requests/15 min
- **OTP Send**: 5 requests/hour per email
- **OTP Verify**: 15 requests/15 min per email

---

## Installation & Setup

### 1. Prerequisites
- Node.js 14+ or higher
- MongoDB (local or Atlas)
- Gmail account (for SMTP) or any email service

### 2. Install Dependencies
```bash
cd auth-backend
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required Environment Variables:**
```env
# Database
MONGODB_URI=mongodb://localhost:27017/aura-auth
NODE_ENV=development

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRE=7d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@aura-ai.com

# Frontend
FRONTEND_URL=http://localhost:3000

# Server
PORT=5000
```

### 4. Setup Gmail SMTP (if using Gmail)
1. Enable 2-factor authentication on Gmail account
2. Generate an [App Password](https://support.google.com/accounts/answer/185833)
3. Use the generated password in `EMAIL_PASSWORD`

### 5. MongoDB Setup

**Option A: Local MongoDB**
```bash
# Start MongoDB service
mongod
```

**Option B: MongoDB Atlas (Cloud)**
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aura-auth
```

### 6. Run the Server

**Development** (with auto-reload):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

Server will start at `http://localhost:5000`

---

## API Endpoints

### 1. Google OAuth Login
**POST** `/auth/google`

**Request:**
```json
{
  "token": "google_id_token_from_frontend"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Google login successful",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "isVerified": true
    }
  }
}
```

Sets `authToken` in HTTP-only cookie automatically.

---

### 2. Send OTP
**POST** `/auth/send-otp`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully. Check your email.",
  "data": {
    "email": "user@example.com",
    "expiresIn": "5 minutes"
  }
}
```

**Error Responses:**
- `429` - Too many requests (cooldown active)
- `429` - Account temporarily blocked (after 5 failed attempts)
- `500` - Email service failure

---

### 3. Verify OTP
**POST** `/auth/verify-otp`

**Request:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "isVerified": true
    }
  }
}
```

Sets `authToken` in HTTP-only cookie automatically.

**Error Responses:**
- `400` - OTP expired (request new one)
- `401` - Invalid OTP (with remaining attempts)
- `429` - Too many failed attempts (15-min block)
- `404` - User not found (request OTP first)

---

### 4. Get Current User
**GET** `/auth/me` (Protected)

**Headers:**
```
Cookie: authToken=jwt_token
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "isVerified": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

**Error Responses:**
- `401` - No token / Invalid token / Token expired
- `404` - User not found

---

### 5. Logout
**POST** `/auth/logout`

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

Clears `authToken` cookie.

---

### 6. Health Check
**GET** `/health`

**Response:**
```json
{
  "status": "healthy",
  "service": "Aura AI Auth Backend",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Database Schema

### User Model
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  googleId: String (unique, sparse),
  isVerified: Boolean,
  otpHash: String (bcrypt hashed OTP),
  otpExpiry: Date (expires in 5 minutes),
  otpAttempts: Number (max 5, then blocked),
  isOtpBlocked: Boolean,
  otpBlockedUntil: Date (15-minute block),
  lastOtpSentAt: Date (60-second cooldown),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

---

## Project Structure

```
auth-backend/
├── controllers/
│   └── authController.js      # Auth business logic
├── routes/
│   └── authRoutes.js           # Express routes
├── models/
│   └── User.js                 # MongoDB schema
├── middleware/
│   ├── auth.js                 # JWT verification
│   ├── rateLimiter.js          # Rate limiting
│   └── errorHandler.js         # Error handling
├── utils/
│   ├── jwt.js                  # Token generation/verification
│   ├── otp.js                  # OTP generation/hashing
│   ├── email.js                # Email service
│   └── response.js             # Response helpers
├── config/
│   ├── database.js             # MongoDB connection
│   └── env.js                  # Environment validation
├── server.js                    # Main server file
├── package.json
├── .env.example
└── README.md
```

---

## Security Measures

### ✅ Implemented
1. **JWT in HTTP-Only Cookies** - XSS protection
2. **Bcrypt Hashing** - OTP never stored in plain text
3. **Rate Limiting** - Prevent brute force attacks
4. **Input Validation** - Express-validator on all inputs
5. **CORS** - Strict origin validation
6. **Helmet** - Secure HTTP headers
7. **NoSQL Injection Prevention** - Mongoose sanitization
8. **OTP Expiration** - 5-minute auto-expire
9. **Attempt Limiting** - Max 5 attempts, then 15-min block
10. **Resend Cooldown** - 60 seconds between OTP sends
11. **JWT Expiration** - 7 days with refresh capability
12. **Environment Variables** - Secrets in .env (not in code)

### 🔒 Best Practices
- Never log sensitive data (OTP, tokens)
- Validate all inputs
- Use HTTPS in production
- Rotate JWT_SECRET periodically
- Monitor failed login attempts
- Use strong MongoDB passwords
- Enable MongoDB IP whitelist
- Regular security updates

---

## Testing the API

### Using cURL

**1. Send OTP:**
```bash
curl -X POST http://localhost:5000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**2. Verify OTP:**
```bash
curl -X POST http://localhost:5000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'
```

**3. Get Current User:**
```bash
curl -X GET http://localhost:5000/auth/me \
  -H "Cookie: authToken=your_jwt_token_here"
```

**4. Logout:**
```bash
curl -X POST http://localhost:5000/auth/logout
```

### Using Postman
1. Import the API endpoints
2. Set `{{base_url}}` to `http://localhost:5000`
3. Test each endpoint
4. Cookies are automatically handled

---

## Environment Variables Reference

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| MONGODB_URI | String | Yes | MongoDB connection string |
| JWT_SECRET | String | Yes | Secret key for signing JWT |
| JWT_EXPIRE | String | No | Token expiration (default: 7d) |
| GOOGLE_CLIENT_ID | String | Yes | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | String | No | Google OAuth client secret |
| EMAIL_HOST | String | Yes | SMTP host (gmail: smtp.gmail.com) |
| EMAIL_PORT | Number | No | SMTP port (default: 587) |
| EMAIL_USER | String | Yes | SMTP username/email |
| EMAIL_PASSWORD | String | Yes | SMTP password/app password |
| EMAIL_FROM | String | No | From email address |
| FRONTEND_URL | String | No | Frontend origin (default: http://localhost:3000) |
| PORT | Number | No | Server port (default: 5000) |
| NODE_ENV | String | No | Environment (development/production) |

---

## Troubleshooting

### MongoDB Connection Failed
- Ensure MongoDB is running: `mongod`
- Check connection string in `.env`
- For MongoDB Atlas, ensure IP whitelist includes your IP

### Email Not Sending
- Check Gmail credentials and app password
- Ensure 2-FA is enabled on Gmail
- Check EMAIL_HOST and EMAIL_PORT
- Review email service logs

### CORS Errors
- Verify FRONTEND_URL in `.env` matches frontend origin
- Check browser console for exact origin
- Update .env if frontend runs on different port

### Rate Limit Blocks
- Wait for the cooldown period to expire
- Clear browser cookies if testing locally
- Check X-RateLimit-Reset header for exact reset time

### JWT Token Errors
- Token may be expired (7 days default)
- Clear cookies and re-login
- Check JWT_SECRET hasn't changed

---

## Performance & Scalability

### Database Optimization
- Indexes on `email` and `googleId` fields
- Automatic cleanup of expired OTPs
- Efficient query patterns using Mongoose lean()

### Rate Limiting
- Configurable limits for different endpoints
- Per-IP and per-user (email) tracking
- Prevents abuse and DDoS attempts

### Async/Await
- Non-blocking operations for email and database
- Efficient concurrent request handling
- Proper error handling in all async functions

---

## Production Deployment

### Pre-deployment Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (32+ characters)
- [ ] Set up MongoDB Atlas or production MongoDB
- [ ] Configure email service (Gmail or SendGrid)
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Enable HTTPS on server
- [ ] Set up environment variables securely
- [ ] Run security audit: `npm audit`
- [ ] Configure MongoDB IP whitelist
- [ ] Set up monitoring and logging

### Deployment Platforms
- **Heroku**: Add Procfile and set config vars
- **Railway/Render**: Connect GitHub repo
- **AWS EC2**: Install Node, MongoDB, set env vars
- **DigitalOcean**: Use App Platform or Droplet

### Example .env for Production
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aura-auth
NODE_ENV=production
JWT_SECRET=generate_a_strong_random_key_here
GOOGLE_CLIENT_ID=your.apps.googleusercontent.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your_app_password
FRONTEND_URL=https://yourdomain.com
PORT=5000
```

---

## License

MIT

---

## Support

For issues, questions, or suggestions:
1. Check this README
2. Review code comments
3. Check error messages
4. Enable debug logging
5. Open a GitHub issue

---

**Built with ❤️ for Aura AI**
