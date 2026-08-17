// Toutes les émissions d'email de l'app passent par ce fichier (aucun autre fichier
// n'appelle nodemailer directement) : codes MFA, création de compte employé, envoi de
// devis au client. Dépend d'EMAIL_USER/EMAIL_PASS (identifiants Gmail) — sans eux
// configurés, chaque sendXxxEmail échoue silencieusement côté appelant (voir devis.js,
// où l'échec d'envoi est un problème produit déjà documenté séparément).
import nodemailer from 'nodemailer';

// Un seul transporteur Gmail partagé pour toute l'app — pas de compte SMTP par
// entreprise, l'email part toujours depuis le même compte technique.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Envoie le code à usage unique de la double authentification (MFA par email/SMS,
// distinct de la méthode TOTP qui n'a pas besoin d'email) — le code lui-même est
// généré et sa durée de vie vérifiée côté appelant (routes/mfa.js), pas ici.
export async function sendMfaCodeEmail(to, code) {
  await transporter.sendMail({
    from: `"YEELEN AgriConnect" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Votre code de vérification',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>YEELEN AgriConnect</h2>
        <p>Votre code de vérification est :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p style="color: #888; font-size: 13px;">Ce code expire dans 10 minutes.</p>
      </div>
    `,
  });
}

// Envoyé quand un admin crée un compte de connexion pour un employé (EmployeesModule,
// option "Créer un compte de connexion") — communique le mot de passe temporaire en
// clair par email, à charge pour l'employé de le changer à la première connexion.
export async function sendWelcomeEmail(to, tempPassword, prenom) {
  await transporter.sendMail({
    from: `"YEELEN AgriConnect" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Votre accès à YEELEN AgriConnect',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Bienvenue ${prenom},</h2>
        <p>Un compte a été créé pour vous sur YEELEN AgriConnect.</p>
        <p>Email de connexion : <strong>${to}</strong></p>
        <p>Mot de passe temporaire : <strong>${tempPassword}</strong></p>
        <p style="color: #888; font-size: 13px;">Pensez à le changer dès votre première connexion.</p>
      </div>
    `,
  });
}

// Envoie un email au client avec un lien vers son devis, pour consultation et signature
// — le lien pointe vers la route publique /devis/public/:token (pas d'authentification
// requise côté client, uniquement le token dans l'URL le protège).
export async function sendDevisEmail(to, clientNom, entrepriseNom, numero, lienConsultation) {
  await transporter.sendMail({
    from: `"${entrepriseNom}" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Devis ${numero} — ${entrepriseNom}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Bonjour ${clientNom},</h2>
        <p>Vous avez reçu un nouveau devis de la part de <strong>${entrepriseNom}</strong>.</p>
        <p>Numéro de devis : <strong>${numero}</strong></p>
        <p><a href="${lienConsultation}" style="display:inline-block; padding:12px 24px; background:#2d6a4f; color:#fff; text-decoration:none; border-radius:8px;">Consulter et signer le devis</a></p>
        <p style="color: #888; font-size: 13px;">Ce lien est personnel, ne le partagez pas.</p>
      </div>
    `,
  });
}
