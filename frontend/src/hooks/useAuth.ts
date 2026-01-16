import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import endpoints from '../constants/endpoints';
import { User } from '../types';

export const useAuth = () => {
    const fetchMe = async () => {
        const res = await api.get<User>(endpoints.auth.me);
        return res.data;
    };

    const { data: user, ...rest } = useQuery({
        queryKey: ['user-me'],
        queryFn: fetchMe,
    });

    return { user, ...rest };
};
