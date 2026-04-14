import { useEffect, useState } from 'react';
import { getSocket } from '../socket/socketClient.js';

/**
 * Subscribes to the shared socket and re-renders when it connects.
 * Does not disconnect on unmount (singleton survives Strict Mode).
 */
export default function useSocket() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = getSocket();

    const sync = () => setSocket(s);
    s.on('connect', sync);
    s.on('disconnect', sync);

    if (s.connected) {
      setSocket(s);
    }

    return () => {
      s.off('connect', sync);
      s.off('disconnect', sync);
    };
  }, []);

  return socket;
}
