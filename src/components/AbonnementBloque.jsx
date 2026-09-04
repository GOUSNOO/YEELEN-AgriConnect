import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LogOut, ShieldAlert } from 'lucide-react';
import { Card, Button } from './ui.jsx';

// Écran plein écran (overlay fixed, au-dessus de tout le shell) quand subscriptionGuard
// renvoie mode==='locked' — abonnement expiré au-delà de la grâce, ou compte suspendu (voir
// App.jsx : billing.mode, mis à jour par GET /billing/status + l'événement
// agri-subscription-blocked émis sur tout 402, voir lib/api.js). Rendu en overlay plutôt qu'en
// remplaçant les écrans existants : évite de toucher les nombreux blocs `{screen === '...' && }`
// déjà présents dans App.jsx pour ce premier passage.
export default function AbonnementBloque({ billing, onLogout }) {
  const { t } = useTranslation();
  const suspended = billing?.status === 'suspended';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(34,39,29,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F6E2DE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {suspended ? <ShieldAlert size={24} color="#B23B2E" /> : <Lock size={24} color="#B23B2E" />}
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>
              {suspended ? t('billing.blocked.suspendedTitle') : t('billing.blocked.expiredTitle')}
            </div>
            <div style={{ fontSize: 13.5, color: '#5B6357' }}>
              {suspended ? t('billing.blocked.suspendedDesc') : t('billing.blocked.expiredDesc')}
            </div>
            <Button variant="ghost" onClick={onLogout} style={{ marginTop: 10 }}>
              <LogOut size={14} /> {t('shell.logout')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
