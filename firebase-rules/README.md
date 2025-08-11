# Firebase Security Rules

This folder contains the security rules for Firebase services used in RebelX.

## Current Rules

### Firestore Rules (`firestore.rules`)
- **Users Collection**: Users can only read/write their own user document
- **Companies Collection**: Users can access companies they belong to
- **Company Creation**: Allows initial company creation during signup

### Storage Rules (`storage.rules`)
- **Company Logos**: Public read access, authenticated write access
- **User Files**: Private access - users can only access their own files

## Deployment

### Test Mode (Current)
The project is currently running in test mode which allows all reads/writes. This is for development only.

### Production Mode
To deploy these rules for production:

1. **Firestore Rules**:
   - Go to Firebase Console → Firestore Database → Rules
   - Copy the content from `firestore.rules`
   - Click "Publish"

2. **Storage Rules**:
   - Go to Firebase Console → Storage → Rules  
   - Copy the content from `storage.rules`
   - Click "Publish"

## Security Considerations

### Current Security Level: 🟡 Medium
- Authentication required for most operations
- Users can only access their own data
- Company data is isolated by company membership

### Recommended Improvements:
- Add role-based access control (admin, member, viewer)
- Implement field-level security
- Add rate limiting rules
- Validate data structure and types
- Add audit logging

## Testing Rules

Before deploying to production, test the rules using:
```bash
firebase emulators:start --only firestore,storage
```

Then run your app against the local emulators to verify security rules work correctly.
