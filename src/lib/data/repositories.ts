'use client';

import type { Room, SavedProduct, UserPreferences, Visualization } from '@/types/domain';
import { brand } from '@/config/brand';
import { idb, STORES } from './db';

/**
 * Repository interfaces.
 *
 * Screens depend on these, never on IndexedDB. Swapping in a server-backed
 * implementation later means writing new classes here and changing the exported
 * singletons at the bottom of this file.
 */

export interface RoomRepository {
  list(): Promise<Room[]>;
  get(id: string): Promise<Room | null>;
  save(room: Room): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SavedProductRepository {
  list(): Promise<SavedProduct[]>;
  isSaved(productId: string): Promise<boolean>;
  add(entry: SavedProduct): Promise<void>;
  remove(productId: string): Promise<void>;
}

export interface VisualizationRepository {
  listForRoom(roomId: string): Promise<Visualization[]>;
  save(visualization: Visualization): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PreferencesRepository {
  get(): Promise<UserPreferences>;
  set(preferences: Partial<UserPreferences>): Promise<UserPreferences>;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  budget: null,
  preferredStyles: [],
  currency: brand.currency,
  theme: 'system',
};

/* -- IndexedDB implementations --------------------------------------------- */

class LocalRoomRepository implements RoomRepository {
  async list(): Promise<Room[]> {
    const rooms = await idb.getAll<Room>(STORES.rooms);
    return rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Room | null> {
    return (await idb.get<Room>(STORES.rooms, id)) ?? null;
  }

  async save(room: Room): Promise<void> {
    await idb.put(STORES.rooms, room);
  }

  async remove(id: string): Promise<void> {
    await idb.delete(STORES.rooms, id);
    // Visualisations belong to their room; leaving them would leak storage.
    const orphans = await this.visualizationsFor(id);
    await Promise.all(orphans.map((item) => idb.delete(STORES.visualizations, item.id)));
  }

  private async visualizationsFor(roomId: string): Promise<Visualization[]> {
    const all = await idb.getAll<Visualization>(STORES.visualizations);
    return all.filter((item) => item.roomId === roomId);
  }
}

class LocalSavedProductRepository implements SavedProductRepository {
  async list(): Promise<SavedProduct[]> {
    const saved = await idb.getAll<SavedProduct>(STORES.savedProducts);
    return saved.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async isSaved(productId: string): Promise<boolean> {
    return (await idb.get<SavedProduct>(STORES.savedProducts, productId)) !== undefined;
  }

  async add(entry: SavedProduct): Promise<void> {
    await idb.put(STORES.savedProducts, entry);
  }

  async remove(productId: string): Promise<void> {
    await idb.delete(STORES.savedProducts, productId);
  }
}

class LocalVisualizationRepository implements VisualizationRepository {
  async listForRoom(roomId: string): Promise<Visualization[]> {
    const all = await idb.getAll<Visualization>(STORES.visualizations);
    return all
      .filter((item) => item.roomId === roomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(visualization: Visualization): Promise<void> {
    await idb.put(STORES.visualizations, visualization);
  }

  async remove(id: string): Promise<void> {
    await idb.delete(STORES.visualizations, id);
  }
}

const PREFERENCES_KEY = 'current';

class LocalPreferencesRepository implements PreferencesRepository {
  async get(): Promise<UserPreferences> {
    const stored = await idb.get<UserPreferences>(STORES.preferences, PREFERENCES_KEY);
    return { ...DEFAULT_PREFERENCES, ...stored };
  }

  async set(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const next = { ...(await this.get()), ...preferences };
    await idb.put(STORES.preferences, next, PREFERENCES_KEY);
    return next;
  }
}

export const roomRepository: RoomRepository = new LocalRoomRepository();
export const savedProductRepository: SavedProductRepository = new LocalSavedProductRepository();
export const visualizationRepository: VisualizationRepository = new LocalVisualizationRepository();
export const preferencesRepository: PreferencesRepository = new LocalPreferencesRepository();
