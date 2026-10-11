import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPlants } from './api.js';

const PlantContext = createContext(null);
const STORAGE_KEY = 'heatpulse:current-plant';

function readSelectedPlant() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function PlantProvider({ children }) {
  const [plants, setPlants] = useState([]);
  const [selectedPlantId, setSelectedPlantIdState] = useState(readSelectedPlant);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const refreshPromise = useRef(null);

  const refreshPlants = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    setStatus('loading');
    setError('');
    const pending = getPlants()
      .then((result) => {
        setPlants(result);
        setStatus('ready');
        return result;
      })
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load your plants.');
        setStatus('error');
        throw requestError;
      })
      .finally(() => {
        if (refreshPromise.current === pending) refreshPromise.current = null;
      });
    refreshPromise.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    refreshPlants().catch(() => {});
  }, [refreshPlants]);

  const setSelectedPlantId = useCallback((plantId) => {
    setSelectedPlantIdState(plantId || '');
    try {
      if (plantId) window.sessionStorage.setItem(STORAGE_KEY, plantId);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Session storage is optional; current selection remains in React state.
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    if (plants.some((plant) => plant.plantId === selectedPlantId)) return;
    setSelectedPlantId(plants[0]?.plantId || '');
  }, [plants, selectedPlantId, setSelectedPlantId, status]);

  const value = useMemo(() => ({
    plants,
    setPlants,
    selectedPlantId,
    setSelectedPlantId,
    refreshPlants,
    status,
    error,
  }), [plants, selectedPlantId, setSelectedPlantId, refreshPlants, status, error]);

  return <PlantContext.Provider value={value}>{children}</PlantContext.Provider>;
}

export function usePlants() {
  const value = useContext(PlantContext);
  if (!value) throw new Error('usePlants must be used inside PlantProvider');
  return value;
}
