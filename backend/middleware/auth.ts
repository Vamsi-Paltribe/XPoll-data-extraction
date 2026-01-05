import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
    user?: any;
}

export default function (req: AuthRequest, res: Response, next: NextFunction) {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if not token
    if (!token) {
        console.log('Auth Middleware: No token provided');
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
        req.user = decoded.user;
        next();
    } catch (err: any) {
        console.log('Auth Middleware: Token verification failed:', err.message);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
