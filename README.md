# Noita Codex

Wiki personnel sombre pour documenter la comprehension progressive de Noita.

## Ouvrir le site en local

Le site statique peut etre servi depuis la racine du dossier. L'interface utilise `localStorage` tant que l'URL de l'API Render n'est pas renseignee.

## Fonctionnalites

- accueil avec presentation et flux des articles recemment mis a jour ;
- header permanent avec recherche textuelle ;
- sidebar permanente avec articles et consultations recentes ;
- editeur riche Quill, avec repli en edition simple si le CDN est indisponible ;
- insertion d'images depuis le poste ;
- liens internes entre articles par slug ;
- historique de comprehension par article, avec timestamp, selecteur et curseur ;
- synchronisation optionnelle avec une API Render + PostgreSQL.

## Deploiement GitHub Pages

Depot cible : `Fluffy-Omelette/noita`.

Publier les fichiers de la racine (`index.html`, `styles.css`, `app.js`, `config.js`, `.nojekyll`) sur GitHub, puis activer GitHub Pages depuis la branche `main` et le dossier racine.

## Deploiement Render

Render doit lancer :

```sh
yarn start
```

L'URL d'API configuree cote front est :

```txt
https://noita.onrender.com
```

Le fichier `render.yaml` declare le service `noita` et la base `noita-db`. Au demarrage, `server/index.js` applique automatiquement `server/schema.sql` si `DATABASE_URL` est presente.

Si l'URL Render change, mettre a jour `config.js` :

```js
window.NOITA_CONFIG = {
  apiBaseUrl: "https://noita.onrender.com"
};
```

La page GitHub Pages ne doit pas se connecter directement a PostgreSQL : l'API Render garde `DATABASE_URL` cote serveur.
