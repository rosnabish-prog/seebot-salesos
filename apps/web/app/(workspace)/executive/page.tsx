'use client';
import {Dashboard} from '@/components/dashboard';import {useAuth,executive} from '@/context/auth';
import {ErrorMessage} from '@/components/ui';
export default function ExecutivePage(){const{user}=useAuth();return executive(user?.role)?<Dashboard executiveView/>:<ErrorMessage message="Executive overview is restricted to authorized leadership roles."/>}
