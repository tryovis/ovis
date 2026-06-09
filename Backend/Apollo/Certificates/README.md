# SSL Certificate Management

This directory contains SSL certificates for HTTPS support in the OVIS application.

## ⚠️ Security Warning

**NEVER commit private key files (.key, .pem, .p12, .pfx) to version control!**

Private keys are automatically excluded via `.gitignore`, but always verify before committing.

## File Structure

- `cert.pem` - SSL certificate (public key)
- `privkey.pem` - Private key (keep secure!)
- Development certificates can be self-signed
- Production certificates should be from a trusted CA

## Quick Setup

### Development (Self-Signed Certificate)
```bash
# Generate self-signed certificate for development
openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Set proper permissions
chmod 600 privkey.pem
chmod 644 cert.pem
```

### Production (Let's Encrypt)
```bash
# Install certbot
sudo apt install certbot

# Obtain certificate (requires domain and port 80 access)
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./privkey.pem

# Set permissions
chmod 644 cert.pem
chmod 600 privkey.pem
```

## Configuration

Use the default certificate filenames in this directory:
```bash
./Setup/Certificates/cert.pem
./Setup/Certificates/privkey.pem
```

## Certificate Validation

The nginx entrypoint automatically validates:
- Certificate files exist
- File permissions are secure
- SSL configuration is valid

## Rotation

To update certificates:
1. Replace files in this directory
2. Restart nginx: `docker compose restart nginx`
3. Check logs for validation errors

## Security Checklist

- [ ] Private key permissions set to 600
- [ ] Certificate permissions set to 644
- [ ] Private keys not in version control
- [ ] Using trusted certificates in production
- [ ] Certificate expiration monitoring in place
- [ ] Backup certificates stored securely

## Troubleshooting

- **"SSL certificate file not found"**: Check `./Setup/Certificates/cert.pem`
- **"SSL private key file not found"**: Check `./Setup/Certificates/privkey.pem`
- **Permission warnings**: Run `chmod 600 privkey.pem`
- **Browser security warnings**: Normal for self-signed certificates in development
