'use client';
import {useEffect} from 'react';
import {installPwaZoomLock} from '../lib/pwaZoomLock.mjs';
export default function PwaGestureGuard(){useEffect(()=>installPwaZoomLock(window),[]);return null;}
