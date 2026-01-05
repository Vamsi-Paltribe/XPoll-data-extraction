import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { User } from '../models/User';
import { Request } from 'express';

// Define User Interface temporarily here or use any if model not ready
// Since we have not migrated models, we will rely on implicit types or any.

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
    User.findById(id).then((user: any) => {
        done(null, user);
    });
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackURL: "/api/auth/google/callback"
}, async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
    // Check if user exists
    const existingUser = await User.findOne({ googleId: profile.id });
    if (existingUser) {
        return done(null, existingUser);
    }
    // Create new user
    const user = await new User({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0].value,
        avatar: profile.photos?.[0].value
    }).save();
    done(null, user);
}));
