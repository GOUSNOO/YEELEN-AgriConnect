import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from './ui.jsx';

const SECTIONS = [
  {
    id: 'accueil',
    title: 'Tableau de bord',
    text: "La page d'accueil résume votre exploitation en un coup d'œil : chiffre d'affaires et dépenses du mois, bénéfice, nombre de ventes, parcelles à arroser, stock d'œufs, livraisons en attente. La section « Alertes importantes » liste ce qui demande votre attention tout de suite.",
  },
  {
    id: 'calendrier',
    title: 'Calendrier',
    text: "Notez les dates importantes de votre exploitation (semis, traitements, rendez-vous...). Les événements sont partagés entre tous les employés de votre entreprise, pas seulement enregistrés sur votre téléphone.",
  },
  {
    id: 'recoltes',
    title: 'Récoltes',
    text: "Enregistrez chaque récolte : parcelle, culture, quantité, qualité, destination. Choisir la bonne parcelle permet de relier plus tard une vente à la récolte dont elle provient (visible dans le détail d'un devis).",
  },
  {
    id: 'cultures',
    title: 'Cultures & irrigation',
    points: [
      "Parcelles : humidité et température du sol (capteurs simulés), seuil d'arrosage, mode automatique ou vanne manuelle.",
      "Stocks : semences, engrais, produits phytosanitaires — quantités et seuils d'alerte.",
      "Ventes / Achats : passent par les devis (module Ventes) et par le formulaire d'achat multi-lignes (module Achats). Chaque achat ou vente enregistré met automatiquement à jour vos Finances.",
      "Comptabilité : total des ventes et achats du module, et l'historique des modifications.",
    ],
  },
  {
    id: 'poulailler',
    title: 'Poulailler',
    text: "Même logique que Cultures, appliquée à l'élevage : température/humidité du poulailler, stocks (aliments, œufs, volailles), ventes/achats/livraisons, et comptabilité automatique.",
  },
  {
    id: 'clients-fournisseurs',
    title: 'Clients & Fournisseurs',
    text: "Vos fiches contacts : coordonnées, historique des achats pour un client, historique des commandes pour un fournisseur. Cliquez sur une fiche dans la liste de gauche pour voir son détail à droite.",
  },
  {
    id: 'finances',
    title: 'Finances & Banques',
    text: "Toutes vos transactions : Caisse, comptes bancaires, dépenses, bénéfice net. Les ventes et achats enregistrés dans Cultures, Poulailler ou via un devis apparaissent ici automatiquement — vous pouvez aussi ajouter une opération manuelle (salaire, carburant, entretien...). Définissez un compte bancaire principal pour que les ventes/achats y soient versés par défaut.",
  },
  {
    id: 'devis',
    title: 'Devis & Factures',
    text: "Créez un devis, ajoutez vos produits, puis envoyez-le au client (par email avec un lien de signature en ligne, ou validez-le manuellement si l'accord a été donné par téléphone). Une fois signé, transformez-le en facture avec paiement complet ou échéances. Chaque paiement d'échéance est reflété dans Finances.",
  },
  {
    id: 'salaries',
    title: 'Salariés',
    text: "Fiches de vos employés : poste, salaire, présence, avances, congés, coordonnées personnelles. Un employé peut avoir un compte de connexion séparé (avec son propre rôle) — c'est différent de son email personnel.",
  },
  {
    id: 'observations',
    title: 'Observations',
    text: "Notes de terrain libres, avec date et localisation — pratique pour consigner ce que vous constatez sur le moment (état d'une culture, un animal malade, un incident...) sans passer par un module précis.",
  },
  {
    id: 'assistant',
    title: 'Assistant IA',
    text: "Posez une question en langage simple sur votre exploitation (bénéfice du mois, stock d'aliments, parcelle à arroser, meilleur client, dépenses à venir) : la réponse est calculée à partir de vos vraies données, pas d'une intelligence artificielle externe.",
  },
  {
    id: 'previsions-rapports',
    title: 'Prévisions & Rapports',
    text: "Prévisions estime vos ventes, dépenses, récoltes et bénéfice du mois prochain à partir de vos tendances récentes. Rapports vous donne le même type de chiffres pour une période passée (jour, semaine, mois, année), avec export en PDF ou CSV.",
  },
  {
    id: 'notifications',
    title: 'Notifications',
    text: "Liste des alertes actives : stock faible, température élevée, sol sec, livraison prévue, facture non payée.",
  },
  {
    id: 'feedback',
    title: 'Feedback',
    text: "Une suggestion, une frustration, un bug rencontré ? Dites-le ici — c'est ce qui nous permet d'améliorer l'application au fil de l'eau, avec les retours des vrais utilisateurs.",
  },
  {
    id: 'profil',
    title: 'Profil & sécurité',
    text: "Vos informations de compte, et l'activation de la double authentification (MFA) pour sécuriser votre connexion avec un code en plus de votre mot de passe.",
  },
];

export function HelpModule() {
  const [openId, setOpenId] = useState(SECTIONS[0].id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Aide</h2>
        <p style={{ margin: 0, color: '#5B6357', fontSize: 13.5 }}>
          Un rappel rapide de ce que fait chaque module. Une question qui n'a pas de réponse ici ? Laissez-la dans Feedback.
        </p>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {SECTIONS.map((section, i) => {
          const isOpen = openId === section.id;
          return (
            <div key={section.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #DAD6C4' }}>
              <button
                onClick={() => setOpenId(isOpen ? null : section.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  padding: '14px 16px', fontFamily: "'Inter', sans-serif", fontSize: 14.5, fontWeight: 600, color: '#22271D',
                }}
              >
                {section.title}
                <ChevronRight size={16} color="#5B6357" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 16px', fontSize: 13.5, color: '#5B6357', lineHeight: 1.6, textAlign: 'left' }}>
                  {section.text && <p style={{ margin: 0 }}>{section.text}</p>}
                  {section.points && (
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {section.points.map((point, idx) => <li key={idx}>{point}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
