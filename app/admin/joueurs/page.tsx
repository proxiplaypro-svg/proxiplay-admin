"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getAdminFollowUpErrorMessage,
  markPlayerAsContactedAction,
  markPlayersAsContactedAction,
} from "@/lib/firebase/adminActions";
import {
  getPlayersList,
  getPlayersPushStatuses,
  type AdminPlayerListItem,
} from "@/lib/firebase/adminQueries";

type FollowUpFilter = "tous" | "a_faire" | "relance" | "sans_reponse" | "ok";
type LastContactSort = "recent_first" | "oldest_first" | "never_first";

function formatOptionalCount(value: number | null) {
  if (value === null) {
    return "Non renseigne";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isValidCity(value: string) {
  const trimmedValue = value.trim();
  const normalizedValue = normalizeString(trimmedValue);

  if (normalizedValue.length < 3) {
    return false;
  }

  return /^[a-z\s'’\-]+$/i.test(trimmedValue);
}

function formatCity(value: string) {
  return value
    .trim()
    .split(/([\s'’-]+)/)
    .map((part) => {
      if (/^[\s'’-]+$/.test(part)) {
        return part;
      }

      const lowerPart = part.toLowerCase();
      return `${lowerPart.charAt(0).toUpperCase()}${lowerPart.slice(1)}`;
    })
    .join("");
}

function getHighlightedTextParts(value: string, query: string) {
  const normalizedValue = normalizeString(value);
  const normalizedQuery = normalizeString(query.trim());

  if (!normalizedQuery) {
    return [{ text: value, highlighted: false }];
  }

  const matchIndex = normalizedValue.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return [{ text: value, highlighted: false }];
  }

  const indexMap: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const normalizedChunk = value[index].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (let chunkIndex = 0; chunkIndex < normalizedChunk.length; chunkIndex += 1) {
      indexMap.push(index);
    }
  }

  const startIndex = indexMap[matchIndex] ?? 0;
  const endNormalizedIndex = matchIndex + normalizedQuery.length - 1;
  const endIndex = (indexMap[endNormalizedIndex] ?? value.length - 1) + 1;

  return [
    { text: value.slice(0, startIndex), highlighted: false },
    { text: value.slice(startIndex, endIndex), highlighted: true },
    { text: value.slice(endIndex), highlighted: false },
  ].filter((part) => part.text.length > 0);
}

function renderHighlightedText(value: string, query: string): ReactNode {
  return getHighlightedTextParts(value, query).map((part, index) => (
    <Fragment key={`${part.text}-${index}`}>
      {part.highlighted ? <mark className="city-option-highlight">{part.text}</mark> : part.text}
    </Fragment>
  ));
}

function getPlayerLabel(player: AdminPlayerListItem) {
  if (player.fullName !== "Non renseigne") {
    return player.fullName;
  }

  if (player.email !== "Non renseigne") {
    return player.email;
  }

  return "Non renseigne";
}

function getPlayerRelaunchAction(player: AdminPlayerListItem) {
  if (player.email !== "Non renseigne") {
    return {
      href: `mailto:${encodeURIComponent(player.email)}?subject=${encodeURIComponent(`Relance ProxiPlay - ${getPlayerLabel(player)}`)}`,
      label: "Relancer",
      disabled: false,
    };
  }

  if (player.phone !== "Non renseigne") {
    return {
      href: `tel:${player.phone}`,
      label: "Relancer",
      disabled: false,
    };
  }

  return {
    href: null,
    label: "Aucun contact",
    disabled: true,
  };
}

function getPushStatusLabel(pushStatus: AdminPlayerListItem["pushStatus"]) {
  if (pushStatus === "actif") {
    return "Push actif";
  }

  if (pushStatus === "inconnu") {
    return "Push inconnu";
  }

  return "Non verifie";
}

function getFollowUpStatusLabel(status: AdminPlayerListItem["followUp"]["followUpStatus"]) {
  switch (status) {
    case "relance":
      return "Relance";
    case "sans_reponse":
      return "Sans reponse";
    case "ok":
      return "OK";
    default:
      return "A faire";
  }
}

function getFollowUpChannelLabel(channel: AdminPlayerListItem["followUp"]["lastContactChannel"]) {
  switch (channel) {
    case "email":
      return "email";
    case "phone":
      return "telephone";
    case "manual":
      return "manuel";
    default:
      return "inconnu";
  }
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<"tous" | "actif" | "inactif">("tous");
  const [statusFilter, setStatusFilter] = useState("tous");
  const [pushFilter, setPushFilter] = useState<"tous" | "actif" | "inconnu">("tous");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("tous");
  const [lastContactSort, setLastContactSort] = useState<LastContactSort>("recent_first");
  const [cityFilter, setCityFilter] = useState("toutes");
  const [citySearch, setCitySearch] = useState("");
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [bulkEmailLoading, setBulkEmailLoading] = useState(false);
  const [pendingRelaunchId, setPendingRelaunchId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const fetchPlayers = async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getPlayersList();
        if (!isCancelled) {
          setPlayers(items);
        }
      } catch (fetchError) {
        console.error(fetchError);
        if (!isCancelled) {
          setError("Impossible de charger la liste des joueurs depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchPlayers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const baseFilteredPlayers = useMemo(() => {
    const normalizedSearch = normalizeString(search.trim());
    const normalizedCityFilter = cityFilter;

    return players.filter((player) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        normalizeString(getPlayerLabel(player)).includes(normalizedSearch) ||
        normalizeString(player.fullName).includes(normalizedSearch) ||
        normalizeString(player.email).includes(normalizedSearch) ||
        normalizeString(player.city).includes(normalizedSearch);
      const matchesActivity =
        activityFilter === "tous" ||
        (activityFilter === "actif" && player.activityState === "actif") ||
        (activityFilter === "inactif" &&
          (player.activityState === "inactif" || player.activityState === "jamais"));
      const matchesStatus =
        statusFilter === "tous" || player.playerStatusCached === statusFilter;
      const matchesFollowUp =
        followUpFilter === "tous" || player.followUp.followUpStatus === followUpFilter;
      const matchesCity =
        normalizedCityFilter === "toutes" ||
        normalizeString(formatCity(player.city)) === normalizedCityFilter;

      return matchesSearch && matchesActivity && matchesStatus && matchesFollowUp && matchesCity;
    });
  }, [activityFilter, cityFilter, followUpFilter, players, search, statusFilter]);

  const playersPendingPushCheck = useMemo(() => {
    if (pushFilter === "tous") {
      return [];
    }

    return baseFilteredPlayers
      .filter((player) => player.pushStatus === "non_verifie")
      .map((player) => player.id);
  }, [baseFilteredPlayers, pushFilter]);

  useEffect(() => {
    if (playersPendingPushCheck.length === 0) {
      return;
    }

    let isCancelled = false;

    const loadPushStatuses = async () => {
      try {
        const pushStatuses = await getPlayersPushStatuses(playersPendingPushCheck);

        if (isCancelled) {
          return;
        }

        setPlayers((currentPlayers) =>
          currentPlayers.map((player) => {
            const pushStatus = pushStatuses.get(player.id);
            return pushStatus ? { ...player, pushStatus } : player;
          }),
        );
      } catch (pushError) {
        console.error(pushError);
      }
    };

    void loadPushStatuses();

    return () => {
      isCancelled = true;
    };
  }, [playersPendingPushCheck]);

  const availableStatuses = useMemo(() => {
    return [...new Set(players.map((player) => player.playerStatusCached).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, "fr"),
    );
  }, [players]);

  const availableCities = useMemo(() => {
    const cityMap = new Map<string, string>();

    players.forEach((player) => {
      if (player.city === "Non renseignee" || !isValidCity(player.city)) {
        return;
      }

      const formattedCity = formatCity(player.city);
      const normalizedCity = normalizeString(formattedCity);

      if (!cityMap.has(normalizedCity)) {
        cityMap.set(normalizedCity, formattedCity);
      }
    });

    return [...cityMap.entries()]
      .map(([normalizedValue, label]) => ({ normalizedValue, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "fr"));
  }, [players]);

  const visibleCityOptions = useMemo(() => {
    const normalizedQuery = normalizeString(citySearch.trim());

    const rankedCities = availableCities
      .filter((city) =>
        normalizedQuery.length === 0 || city.normalizedValue.includes(normalizedQuery),
      )
      .map((city) => ({
        ...city,
        startsWithQuery:
          normalizedQuery.length > 0 && city.normalizedValue.startsWith(normalizedQuery),
        matchIndex:
          normalizedQuery.length > 0
            ? city.normalizedValue.indexOf(normalizedQuery)
            : 0,
      }))
      .sort((left, right) => {
        if (left.startsWithQuery !== right.startsWithQuery) {
          return left.startsWithQuery ? -1 : 1;
        }

        if (left.matchIndex !== right.matchIndex) {
          return left.matchIndex - right.matchIndex;
        }

        return left.label.localeCompare(right.label, "fr");
      });

    return rankedCities.slice(0, 15);
  }, [availableCities, citySearch]);

  const isResolvingPushFilter =
    pushFilter !== "tous" && playersPendingPushCheck.length > 0;

  const filteredPlayers = useMemo(() => {
    const pushFilteredPlayers =
      pushFilter === "tous" || isResolvingPushFilter
        ? baseFilteredPlayers
        : baseFilteredPlayers.filter((player) => player.pushStatus === pushFilter);

    return [...pushFilteredPlayers].sort((left, right) => {
      if (lastContactSort === "never_first") {
        if (left.followUp.hasLastContact !== right.followUp.hasLastContact) {
          return left.followUp.hasLastContact ? 1 : -1;
        }
      }

      const leftValue = left.followUp.lastContactAtValue;
      const rightValue = right.followUp.lastContactAtValue;

      if (leftValue === rightValue) {
        return getPlayerLabel(left).localeCompare(getPlayerLabel(right), "fr");
      }

      if (lastContactSort === "oldest_first") {
        return leftValue - rightValue;
      }

      return rightValue - leftValue;
    });
  }, [baseFilteredPlayers, isResolvingPushFilter, lastContactSort, pushFilter]);

  const playerOverview = useMemo(() => {
    const totalPlayers = filteredPlayers.length;
    const activePlayers = filteredPlayers.filter(
      (player) => player.assiduityLabel === "Tres actif" || player.assiduityLabel === "Actif",
    ).length;
    const relaunchPlayers = filteredPlayers.filter(
      (player) => player.assiduityLabel === "A relancer",
    ).length;
    const inactivePlayers = filteredPlayers.filter(
      (player) => player.assiduityLabel === "Inactif" || player.assiduityLabel === "Jamais actif",
    ).length;

    return {
      totalPlayers,
      activePlayers,
      relaunchPlayers,
      inactivePlayers,
    };
  }, [filteredPlayers]);

  const visiblePlayerIds = useMemo(
    () => filteredPlayers.map((player) => player.id),
    [filteredPlayers],
  );
  const selectedVisibleIds = useMemo(
    () => selection.filter((id) => visiblePlayerIds.includes(id)),
    [selection, visiblePlayerIds],
  );
  const selectedVisiblePlayers = useMemo(
    () => filteredPlayers.filter((player) => selectedVisibleIds.includes(player.id)),
    [filteredPlayers, selectedVisibleIds],
  );
  const allVisibleSelected =
    visiblePlayerIds.length > 0 && selectedVisibleIds.length === visiblePlayerIds.length;

  useEffect(() => {
    setSelection((current) => {
      const nextSelection = current.filter((id) => visiblePlayerIds.includes(id));

      if (nextSelection.length === current.length) {
        return current;
      }

      return nextSelection;
    });
  }, [visiblePlayerIds]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (search.trim().length > 0) {
      labels.push(`Recherche: ${search.trim()}`);
    }

    if (activityFilter !== "tous") {
      labels.push(activityFilter === "actif" ? "Actifs" : "Inactifs");
    }

    if (pushFilter !== "tous") {
      labels.push(pushFilter === "actif" ? "Push actif" : "Push inconnu");
    }

    if (followUpFilter !== "tous") {
      labels.push(`Suivi: ${getFollowUpStatusLabel(followUpFilter)}`);
    }

    if (statusFilter !== "tous") {
      labels.push(`Statut: ${statusFilter}`);
    }

    if (cityFilter !== "toutes") {
      const activeCity = availableCities.find((city) => city.normalizedValue === cityFilter);
      labels.push(`Ville: ${activeCity?.label ?? cityFilter}`);
    }

    return labels;
  }, [activityFilter, availableCities, cityFilter, followUpFilter, pushFilter, search, statusFilter]);

  const handleDeletePlaceholder = (player: AdminPlayerListItem) => {
    const confirmed = window.confirm(
      `La suppression definitive de ${getPlayerLabel(player)} n est pas encore branchee de facon securisee.\n\nConfirmer pour afficher la recommandation admin.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteId(player.id);
    setActionFeedback(
      `Suppression non activee pour ${getPlayerLabel(player)}. Recommandation V1: passer par une action de suspension admin securisee plutot qu une suppression directe.`,
    );
    setPendingDeleteId(null);
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelection((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  };

  const toggleAllVisiblePlayers = () => {
    setSelection(allVisibleSelected ? [] : visiblePlayerIds);
  };

  const handleBulkPlayerEmail = () => {
    void (async () => {
      const contactablePlayers = selectedVisiblePlayers.filter(
        (player) => player.email.trim().length > 0 && player.email !== "Non renseigne",
      );
      const emails = [...new Set(contactablePlayers.map((player) => player.email.trim()))];

      if (emails.length === 0) {
        setActionFeedback("Aucun email exploitable dans la selection visible.");
        return;
      }

      setBulkEmailLoading(true);
      setActionFeedback(null);

      try {
        await markPlayersAsContactedAction({
          userIds: contactablePlayers.map((player) => player.id),
          lastContactChannel: "email",
        });

        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(now));

        setPlayers((current) =>
          current.map((player) =>
            contactablePlayers.some((item) => item.id === player.id)
              ? {
                  ...player,
                  followUp: {
                    ...player.followUp,
                    lastContactAtLabel: nowLabel,
                    lastContactAtValue: now,
                    lastContactChannel: "email",
                    followUpStatus: "relance",
                    hasLastContact: true,
                  },
                }
              : player,
          ),
        );

        const subject = encodeURIComponent("Relance ProxiPlay");
        const body = encodeURIComponent(
          "Bonjour,\n\nJe reviens vers vous au sujet de votre activite ProxiPlay.\n\nBien a vous,\nL equipe ProxiPlay",
        );

        window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${subject}&body=${body}`;
        setActionFeedback(`${emails.length} adresse(s) email preparee(s) et marquee(s) comme relancees.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setBulkEmailLoading(false);
      }
    })();
  };

  const handlePlayerRelaunch = (player: AdminPlayerListItem) => {
    const relaunchAction = getPlayerRelaunchAction(player);

    if (relaunchAction.disabled || !relaunchAction.href) {
      setActionFeedback("Aucun canal de relance exploitable pour ce joueur.");
      return;
    }

    const channel = relaunchAction.href.startsWith("mailto:") ? "email" : "phone";

    void (async () => {
      setPendingRelaunchId(player.id);
      setActionFeedback(null);

      try {
        await markPlayerAsContactedAction({
          userId: player.id,
          lastContactChannel: channel,
        });

        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(now));

        setPlayers((current) =>
          current.map((currentPlayer) =>
            currentPlayer.id === player.id
              ? {
                  ...currentPlayer,
                  followUp: {
                    ...currentPlayer.followUp,
                    lastContactAtLabel: nowLabel,
                    lastContactAtValue: now,
                    lastContactChannel: channel,
                    followUpStatus: "relance",
                    hasLastContact: true,
                  },
                }
              : currentPlayer,
          ),
        );

        window.location.href = relaunchAction.href;
        setActionFeedback(`Relance joueur preparee et suivi mis a jour via ${channel === "email" ? "email" : "telephone"}.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setPendingRelaunchId(null);
      }
    })();
  };

  const handleCopyPlayerPhones = async () => {
    const phones = selectedVisiblePlayers
      .map((player) => ({
        name: getPlayerLabel(player),
        phone: player.phone.trim(),
      }))
      .filter((item) => item.phone.length > 0 && item.phone !== "Non renseigne");

    if (phones.length === 0) {
      setActionFeedback("Aucun telephone exploitable dans la selection visible.");
      return;
    }

    const payload = phones.map((item) => `${item.name} - ${item.phone}`).join("\n");

    try {
      await navigator.clipboard.writeText(payload);
      setActionFeedback(`${phones.length} telephone(s) copie(s) dans le presse-papiers.`);
    } catch (copyError) {
      console.error(copyError);
      setActionFeedback("Impossible de copier les telephones pour le moment.");
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Joueurs</h2>
          <p>
            Vue admin V1 des joueurs pour le suivi, le contact et les premieres actions
            support a partir des champs deja presents dans `users`.
          </p>
        </div>

        <div className="overview-grid players-overview-grid">
          <div className="overview-card">
            <span>Joueurs visibles</span>
            <strong>{playerOverview.totalPlayers}</strong>
          </div>
          <div className="overview-card">
            <span>Actifs</span>
            <strong>{playerOverview.activePlayers}</strong>
          </div>
          <div className="overview-card">
            <span>A relancer</span>
            <strong>{playerOverview.relaunchPlayers}</strong>
          </div>
          <div className="overview-card">
            <span>Inactifs</span>
            <strong>{playerOverview.inactivePlayers}</strong>
          </div>
        </div>

        <div className="games-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche</span>
            <input
              className="search-input"
              type="search"
              placeholder="Rechercher par nom, email ou ville"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="filter-group" aria-label="Filtres joueurs">
            <button
              type="button"
              className={`filter-chip ${activityFilter === "tous" ? "active" : ""}`}
              onClick={() => setActivityFilter("tous")}
            >
              Tous
            </button>
            <button
              type="button"
              className={`filter-chip ${activityFilter === "actif" ? "active" : ""}`}
              onClick={() => setActivityFilter("actif")}
            >
              Actifs
            </button>
            <button
              type="button"
              className={`filter-chip ${activityFilter === "inactif" ? "active" : ""}`}
              onClick={() => setActivityFilter("inactif")}
            >
              Inactifs
            </button>
          </div>

          <div className="filter-group">
            <label className="search-field">
              <span className="search-label">Push</span>
              <select
                className="search-input"
                value={pushFilter}
                onChange={(event) =>
                  setPushFilter(event.target.value as "tous" | "actif" | "inconnu")
                }
              >
                <option value="tous">Tous</option>
                <option value="actif">Push actif</option>
                <option value="inconnu">Push inconnu</option>
              </select>
            </label>

            <label className="search-field">
              <span className="search-label">Statut joueur</span>
              <select
                className="search-input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="tous">Tous</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="search-field">
              <span className="search-label">Suivi</span>
              <select
                className="search-input"
                value={followUpFilter}
                onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)}
              >
                <option value="tous">Tous</option>
                <option value="a_faire">A faire</option>
                <option value="relance">Relance</option>
                <option value="sans_reponse">Sans reponse</option>
                <option value="ok">OK</option>
              </select>
            </label>

            <label className="search-field">
              <span className="search-label">Derniere relance</span>
              <select
                className="search-input"
                value={lastContactSort}
                onChange={(event) => setLastContactSort(event.target.value as LastContactSort)}
              >
                <option value="recent_first">Plus recente</option>
                <option value="oldest_first">Plus ancienne</option>
                <option value="never_first">Jamais relance d abord</option>
              </select>
            </label>

            <label className="search-field">
              <span className="search-label">Ville</span>
              <div className="city-filter-dropdown">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Toutes"
                  value={citySearch}
                  onFocus={() => setIsCityDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setIsCityDropdownOpen(false);

                      if (cityFilter === "toutes") {
                        setCitySearch("");
                        return;
                      }

                      const activeCity = availableCities.find(
                        (city) => city.normalizedValue === cityFilter,
                      );
                      setCitySearch(activeCity?.label ?? "");
                    }, 120);
                  }}
                  onChange={(event) => {
                    setCitySearch(event.target.value);
                    setIsCityDropdownOpen(true);

                    if (event.target.value.trim().length === 0) {
                      setCityFilter("toutes");
                    }
                  }}
                />
                {cityFilter !== "toutes" ? (
                  <button
                    type="button"
                    className="city-filter-clear"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setCityFilter("toutes");
                      setCitySearch("");
                      setIsCityDropdownOpen(false);
                    }}
                  >
                    Effacer
                  </button>
                ) : null}
                {isCityDropdownOpen ? (
                  <div className="city-filter-menu">
                    <button
                      type="button"
                      className={`city-filter-option ${cityFilter === "toutes" ? "active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setCityFilter("toutes");
                        setCitySearch("");
                        setIsCityDropdownOpen(false);
                      }}
                    >
                      Toutes
                    </button>
                    {visibleCityOptions.map((city) => (
                      <button
                        key={city.normalizedValue}
                        type="button"
                        className={`city-filter-option ${cityFilter === city.normalizedValue ? "active" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCityFilter(city.normalizedValue);
                          setCitySearch(city.label);
                          setIsCityDropdownOpen(false);
                        }}
                      >
                        {renderHighlightedText(city.label, citySearch)}
                      </button>
                    ))}
                    {visibleCityOptions.length === 0 ? (
                      <div className="city-filter-empty">Aucune ville valide</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        </div>

        {!loading && !error ? (
          <div className="panel-heading" style={{ paddingTop: 0 }}>
            <p>
              {isResolvingPushFilter
                ? "Verification des statuts push..."
                : activeFilterLabels.length === 0
                  ? `${players.length} joueurs affiches`
                  : `${filteredPlayers.length} joueurs affiches sur ${players.length}`}
            </p>
            {!isResolvingPushFilter && activeFilterLabels.length > 0 ? (
              <p>Filtres actifs: {activeFilterLabels.join(" · ")}</p>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement des joueurs Firestore...</p>
          </div>
        ) : null}

        {!loading && error ? <p className="feedback error">{error}</p> : null}
        {!loading && !error && actionFeedback ? <p className="feedback">{actionFeedback}</p> : null}
        {!loading && !error && isResolvingPushFilter ? (
          <p className="feedback">Verification du statut Push pour les joueurs affiches...</p>
        ) : null}

        {!loading && !error && selectedVisibleIds.length > 0 ? (
          <div className="bulk-actions-bar">
            <strong>{selectedVisibleIds.length} selectionne(s)</strong>
            <div className="bulk-actions-group">
              <button
                className="primary-button bulk-action-button"
                type="button"
                disabled={bulkEmailLoading || pendingRelaunchId !== null}
                onClick={handleBulkPlayerEmail}
              >
                {bulkEmailLoading ? "Mise a jour..." : "Relancer par email"}
              </button>
              <button className="secondary-button inline-secondary-button bulk-action-button" type="button" onClick={() => void handleCopyPlayerPhones()}>
                Copier les telephones
              </button>
              <button
                className="secondary-button inline-secondary-button bulk-action-button"
                type="button"
                onClick={() => setSelection([])}
              >
                Tout deselectionner
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && filteredPlayers.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun joueur a afficher</strong>
            <p>
              Aucun document `users` joueur ne correspond a la recherche ou aux filtres
              selectionnes.
            </p>
          </div>
        ) : null}

        {!loading && !error && filteredPlayers.length > 0 ? (
          <div className="games-admin-table">
            <div className="players-table-header">
              <label className="table-checkbox">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisiblePlayers}
                  aria-label="Tout selectionner"
                />
              </label>
              <span>Joueur</span>
              <span>Contact</span>
              <span>Performance</span>
              <span>Activite</span>
              <span>Actions</span>
            </div>

            <div className="games-table-body">
              {filteredPlayers.map((player) => (
                <article
                  key={player.id}
                  className={`players-table-row ${selectedVisibleIds.includes(player.id) ? "row-selected" : ""}`}
                >
                  {(() => {
                    const relaunchAction = getPlayerRelaunchAction(player);
                    const canViewDetails = player.id.trim().length > 0;

                    return (
                      <>
                  <div className="games-cell checkbox-cell" data-label="Selection">
                    <label className="table-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedVisibleIds.includes(player.id)}
                        onChange={() => togglePlayerSelection(player.id)}
                        aria-label={`Selectionner ${getPlayerLabel(player)}`}
                      />
                    </label>
                  </div>
                  <div className="games-cell" data-label="Joueur">
                    <div className="player-identity">
                      <strong>{getPlayerLabel(player)}</strong>
                      {player.fullName !== "Non renseigne" &&
                      getPlayerLabel(player) !== player.fullName ? (
                        <span>{player.fullName}</span>
                      ) : null}
                    </div>
                    {player.city !== "Non renseignee" ? <small>{player.city}</small> : null}
                  </div>
                  <div className="games-cell" data-label="Contact">
                    <div className="player-contact-stack">
                      <strong>{player.email}</strong>
                      <span>{player.phone}</span>
                    </div>
                  </div>
                  <div className="games-cell" data-label="Performance">
                    <div className="player-metrics-grid">
                      <div className="player-metric-tile">
                        <span>Parties</span>
                        <strong>{formatOptionalCount(player.gamesPlayedCount)}</strong>
                      </div>
                      <div className="player-metric-tile">
                        <span>Gains</span>
                        <strong>{formatOptionalCount(player.winsCount)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="games-cell" data-label="Activite">
                    <span
                      className={`player-assiduity-pill ${player.activityState}`}
                    >
                      {player.assiduityLabel}
                    </span>
                    <span className="player-last-activity">{player.lastRealActivityLabel}</span>
                    <span className={`player-push-pill ${player.pushStatus}`}>
                      {getPushStatusLabel(player.pushStatus)}
                    </span>
                    <span className={`follow-up-badge ${player.followUp.followUpStatus}`}>
                      {getFollowUpStatusLabel(player.followUp.followUpStatus)}
                    </span>
                    <small className="follow-up-meta">
                      {player.followUp.hasLastContact
                        ? `${player.followUp.lastContactAtLabel} via ${getFollowUpChannelLabel(player.followUp.lastContactChannel)}`
                        : "Aucune relance renseignee"}
                    </small>
                  </div>
                  <div className="games-cell" data-label="Actions">
                    <div className="player-actions">
                      {!relaunchAction.disabled && relaunchAction.href ? (
                        <button
                          className="row-link-button"
                          type="button"
                          disabled={bulkEmailLoading || pendingRelaunchId === player.id}
                          onClick={() => handlePlayerRelaunch(player)}
                        >
                          {pendingRelaunchId === player.id ? "Mise a jour..." : relaunchAction.label}
                        </button>
                      ) : (
                        <button
                          className="row-link-button secondary"
                          disabled
                          type="button"
                        >
                          {relaunchAction.label}
                        </button>
                      )}
                      {canViewDetails ? (
                        <Link className="row-link-button secondary" href={`/admin/joueurs/${player.id}`}>
                          Voir detail
                        </Link>
                      ) : (
                        <button className="row-link-button secondary" type="button" disabled>
                          Voir detail
                        </button>
                      )}
                      <button
                        className="row-link-button secondary"
                        type="button"
                        disabled={pendingDeleteId === player.id}
                        onClick={() => handleDeletePlaceholder(player)}
                      >
                        {pendingDeleteId === player.id ? "Verification..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
