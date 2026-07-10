# YEELEN AgriConnect

Application de gestion agricole full-stack — Suivi des cultures, du poulailler, des clients, des finances et de l'exploitation.

## Stack technique

- **Frontend** : React 19 + Vite 8 + PWA (vite-plugin-pwa)
- **Backend** : Express.js + PostgreSQL + JWT
- **UI** : Lucide React + styles inline (design system maison)

## Lancer le projet

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd server
npm install
npm run dev
```

## Variables d'environnement

Copier `server/.env.example` en `server/.env` et renseigner :

```
PORT=4000
JWT_SECRET=votre_secret_jwt
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_NAME=agriapp
```

## Modules disponibles

- Tableau de bord (Home)
- Calendrier agricole
- Récoltes
- Cultures & irrigation (capteurs simulés)
- Poulailler (suivi, stocks, ventes, livraisons)
- Clients
- Finances
- Assistant IA
- Prévisions
- Rapports (PDF / CSV)

## Rôles

| Rôle | Accès |
|---|---|
| Administrateur | Accès complet |
| Gestionnaire | Pilotage opérationnel |
| Comptable | Finances & clients |
| Ouvrier | Terrain (cultures, poulailler) |
