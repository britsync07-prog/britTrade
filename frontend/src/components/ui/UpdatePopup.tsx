import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Activity, RotateCw } from 'lucide-react';
import api from '../../services/api';

interface VersionInfo {
  version: string;
  downloadUrl: string;
  forceUpdate: boolean;
}

export default function UpdatePopup() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const { data } = await api.get('/public/version');
        const current = import.meta.env.VITE_APP_VERSION || '1.0.0';
        if (data.version && data.version !== current) {
          setUpdateInfo(data);
        }
      } catch {
        // Silently fail if version endpoint unavailable
      } finally {
        setChecked(true);
      }
    };
    checkVersion();
  }, []);

  const handleUpdate = () => {
    if (updateInfo?.downloadUrl) {
      setDownloading(true);
      window.open(updateInfo.downloadUrl, '_blank');
      setTimeout(() => setDownloading(false), 3000);
    } else {
      // Fallback: reload to get latest service worker / PWA
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {checked && updateInfo && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md z-[201]"
          >
            <div className="glass-card p-8 sm:p-10 border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 text-center">
              <div className="p-4 bg-cyan-500/10 rounded-2xl mb-6 mx-auto w-fit relative">
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-2xl" />
                <Activity className="w-12 h-12 text-cyan-400 relative z-10 animate-pulse" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-white mb-3">
                Update Available
              </h2>
              <p className="text-slate-400 text-sm sm:text-base font-medium mb-2">
                A new version of BritTrade is ready.
              </p>
              <p className="text-cyan-400/60 text-xs font-bold uppercase tracking-widest mb-8">
                v{import.meta.env.VITE_APP_VERSION || '1.0.0'} → v{updateInfo.version}
              </p>

              <button
                onClick={handleUpdate}
                disabled={downloading}
                className="w-full h-14 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest hover:from-cyan-400 hover:to-blue-500 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-cyan-500/20"
              >
                {downloading ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    {updateInfo.downloadUrl ? 'Download Update' : 'Refresh App'}
                  </>
                )}
              </button>

              <p className="mt-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                You must update to continue using the app
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
