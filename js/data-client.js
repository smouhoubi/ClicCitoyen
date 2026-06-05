/**
 * data-client.js — Client de données statiques ClicCitoyen
 * Toutes les pages HTML dépendent de ce fichier.
 *
 * Fonctions exportées (globales) :
 *   fetchMunicipalites(limit?)  → Promise<Array<Muni>>
 *   fetchVille(code)            → Promise<VillePayload>
 *   fetchGroupes(annee?)        → Promise<GroupesPayload>
 *   fetchHistorique(code)       → Promise<HistoriquePayload>
 *   getUrlParam(name)           → string | null
 *   formatCAD(val, decimales?)  → string
 *   formatNombre(val)           → string
 *   formatTaux(val)             → string
 *   calculerTaxes(valeur, taux) → number
 *
 * Constante exportée :
 *   DEMO_MUNIS  → Array<Muni>  (données de démo si API indisponible)
 */

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Chemin de base vers le dossier data/.
 * En local : "../data"  |  Sur Netlify : "/data" ou "./data"
 * On détecte automatiquement selon le protocole.
 */
(function () {
  'use strict';

  // ── Base URL ─────────────────────────────────────────────────────────────

  function getDataBase() {
    const loc = window.location;
    // Détermine le chemin vers data/ en fonction de la position de la page HTML.
    // Les pages HTML sont à la racine du projet (même niveau que data/).
    if (loc.protocol === 'file:') {
      // Ouvert directement via file:// → chemin relatif depuis la racine du projet
      return './data';
    }
    // Hébergé sur un serveur : les pages sont à la racine (ex: /ville.html)
    // ou dans un sous-dossier /html/
    const inHtmlDir = loc.pathname.startsWith('/html/');
    return inHtmlDir ? '../data' : './data';
  }

  const DATA_BASE = getDataBase();

  // ── Cache en mémoire ─────────────────────────────────────────────────────

  const _cache = {};

  async function fetchJSON(url) {
    if (_cache[url]) return _cache[url];
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
    const data = await resp.json();
    _cache[url] = data;
    return data;
  }

  // ── API publique ─────────────────────────────────────────────────────────

  /**
   * Charge la liste des municipalités.
   * @param {number} [limit=0] - Si > 0, retourne au plus N municipalités.
   * @returns {Promise<Array>}
   */
  async function fetchMunicipalites(limit = 0) {
    const data = await fetchJSON(`${DATA_BASE}/municipalites.json`);
    // Structure attendue : { munis: [...] }  ou directement un tableau
    const liste = Array.isArray(data) ? data : (data.munis || []);
    return limit > 0 ? liste.slice(0, limit) : liste;
  }

  /**
   * Charge le tableau de bord complet d'une municipalité.
   * @param {string} code - Code géographique à 5 chiffres (ex : "58007")
   * @returns {Promise<Object>} - { dashboard, elus, categories_depenses, ... }
   */
  async function fetchVille(code) {
    const c = String(code).padStart(5, '0');
    return await fetchJSON(`${DATA_BASE}/ville/${c}.json`);
  }

  /**
   * Charge les médianes de référence par groupe pour une année.
   * @param {number} [annee] - Année fiscale. Défaut : annee_active de index.json.
   * @returns {Promise<Object>} - { groupes: [...] } indexés par code_groupe
   */
  async function fetchGroupes(annee) {
    let yr = annee;
    if (!yr) {
      try {
        const idx = await fetchJSON(`${DATA_BASE}/index.json`);
        yr = idx.annee_active || new Date().getFullYear() - 1;
      } catch {
        yr = new Date().getFullYear() - 1;
      }
    }
    return await fetchJSON(`${DATA_BASE}/groupes/${yr}.json`);
  }

  /**
   * Charge l'historique temporel d'une municipalité.
   * @param {string} code
   * @param {string[]} [filtreIndicateurs] - Si fourni, retourne seulement ces codes.
   * @returns {Promise<Object>} - { TGTU: [{annee, valeur},...], ... }
   */
  async function fetchHistorique(code, filtreIndicateurs) {
    const c = String(code).padStart(5, '0');
    const data = await fetchJSON(`${DATA_BASE}/historique/${c}.json`);
    const indicateurs = data.indicateurs || {};
    if (!filtreIndicateurs || !filtreIndicateurs.length) return indicateurs;
    const result = {};
    filtreIndicateurs.forEach(k => {
      if (indicateurs[k]) result[k] = indicateurs[k];
    });
    return result;
  }

  /**
   * Charge l'année active depuis index.json.
   * @returns {Promise<number>}
   */
  async function getAnneeActive() {
    try {
      const idx = await fetchJSON(`${DATA_BASE}/index.json`);
      return idx.annee_active || new Date().getFullYear() - 1;
    } catch {
      return new Date().getFullYear() - 1;
    }
  }

  /**
   * Charge les groupes de référence pour un tableau de codes_groupe.
   * @param {string[]} codesGroupe - ex: ['PROV_QUEBEC', 'CL_25K_99K']
   * @param {number} [annee]
   * @returns {Promise<Array>} - tableau de {code_groupe, libelle_groupe, ...medianes}
   */
  async function fetchReference(codesGroupe, annee) {
    const data = await fetchGroupes(annee);
    const groupes = data.groupes || [];
    if (!codesGroupe || !codesGroupe.length) return groupes;
    return groupes.filter(g => codesGroupe.includes(g.code_groupe));
  }

  // ── Utilitaires URL ──────────────────────────────────────────────────────

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ── Formatage ─────────────────────────────────────────────────────────────

  /**
   * Formate un montant en dollars canadiens.
   * @param {number|null} val
   * @param {number} [decimales=1]  - 0 → entier, 1 → un décimale, etc.
   */
  function formatCAD(val, decimales = 1) {
    if (val == null || isNaN(Number(val))) return '—';
    const n = Number(val);
    const abs = Math.abs(n);
    let fmt;
    if (abs >= 1e9) {
      fmt = (n / 1e9).toFixed(decimales) + ' G$';
    } else if (abs >= 1e6) {
      fmt = (n / 1e6).toFixed(decimales) + ' M$';
    } else if (abs >= 1e3) {
      fmt = (n / 1e3).toFixed(decimales) + ' k$';
    } else {
      fmt = n.toFixed(decimales) + ' $';
    }
    return fmt;
  }

  /**
   * Formate un nombre avec séparateur de milliers.
   */
  function formatNombre(val) {
    if (val == null || isNaN(Number(val))) return '—';
    return Number(val).toLocaleString('fr-CA');
  }

  /**
   * Formate un taux global de taxation ($/100$).
   */
  function formatTaux(val) {
    if (val == null || isNaN(Number(val))) return '—';
    return parseFloat(val).toFixed(4) + ' $/100$';
  }

  /**
   * Calcule l'impôt foncier annuel estimé.
   * @param {number} valeurMaison  - Valeur d'évaluation foncière ($)
   * @param {number} taux          - TGTU ($/100$)
   * @returns {number}
   */
  function calculerTaxes(valeurMaison, taux) {
    if (!valeurMaison || !taux) return 0;
    return (valeurMaison / 100) * taux;
  }

  // ── Données de démonstration ──────────────────────────────────────────────
  // Utilisées comme fallback si les JSON ne sont pas encore générés.

  const DEMO_MUNIS = [
    {
      code_geographique: '66023',
      nom: 'Montréal',
      region_administrative: 'Montréal',
      population: 2165407,
      classe_population: '100 000 et plus',
      taux_global_taxation: 0.6627,
      charge_fiscale_logement: 3241,
      charges_totales: 6800000000,
      indice_effort_fiscal: 92,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '24023',
      nom: 'Québec',
      region_administrative: 'Capitale-Nationale',
      population: 549459,
      classe_population: '100 000 et plus',
      taux_global_taxation: 0.8521,
      charge_fiscale_logement: 2980,
      charges_totales: 1900000000,
      indice_effort_fiscal: 117,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '43027',
      nom: 'Laval',
      region_administrative: 'Laval',
      population: 453500,
      classe_population: '100 000 et plus',
      taux_global_taxation: 0.7110,
      charge_fiscale_logement: 2762,
      charges_totales: 1250000000,
      indice_effort_fiscal: 98,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '43037',
      nom: 'Longueuil',
      region_administrative: 'Montérégie',
      population: 253000,
      classe_population: '100 000 et plus',
      taux_global_taxation: 0.7680,
      charge_fiscale_logement: 2890,
      charges_totales: 890000000,
      indice_effort_fiscal: 106,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '58007',
      nom: 'Brossard',
      region_administrative: 'Montérégie',
      population: 95066,
      classe_population: '25 000 à 99 999',
      taux_global_taxation: 0.4911,
      charge_fiscale_logement: 2185,
      charges_totales: 218000000,
      indice_effort_fiscal: 68,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '94068',
      nom: 'Gatineau',
      region_administrative: 'Outaouais',
      population: 291000,
      classe_population: '100 000 et plus',
      taux_global_taxation: 1.0150,
      charge_fiscale_logement: 3100,
      charges_totales: 750000000,
      indice_effort_fiscal: 140,
      annee_fiscale: 2024,
    },
    {
      code_geographique: '73048',
      nom: 'Sherbrooke',
      region_administrative: 'Estrie',
      population: 172950,
      classe_population: '100 000 et plus',
      taux_global_taxation: 0.9240,
      charge_fiscale_logement: 2650,
      charges_totales: 480000000,
      indice_effort_fiscal: 127,
      annee_fiscale: 2024,
    },
  ];

  // ── Export global ─────────────────────────────────────────────────────────

  window.fetchMunicipalites = fetchMunicipalites;
  window.fetchVille         = fetchVille;
  window.fetchGroupes       = fetchGroupes;
  window.fetchHistorique    = fetchHistorique;
  window.fetchReference     = fetchReference;
  window.getAnneeActive     = getAnneeActive;
  window.getUrlParam        = getUrlParam;
  window.formatCAD          = formatCAD;
  window.formatNombre       = formatNombre;
  window.formatTaux         = formatTaux;
  window.calculerTaxes      = calculerTaxes;
  window.DEMO_MUNIS         = DEMO_MUNIS;
  window.DATA_BASE          = DATA_BASE;

})();
