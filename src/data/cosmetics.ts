import type { Rarity } from './clubs';

export type CosmeticSlot = 'hat' | 'shirt' | 'pants' | 'shoes' | 'gloves' | 'glasses' | 'accessory' | 'bag';
export const COSMETIC_SLOTS: CosmeticSlot[] = ['hat', 'shirt', 'pants', 'shoes', 'gloves', 'glasses', 'accessory', 'bag'];
export const SLOT_NAMES: Record<CosmeticSlot, string> = {
  hat: 'Hats', shirt: 'Shirts', pants: 'Trousers', shoes: 'Shoes', gloves: 'Gloves', glasses: 'Glasses', accessory: 'Accessories', bag: 'Golf Bags',
};
/** slots that may be left empty */
export const OPTIONAL_SLOTS: CosmeticSlot[] = ['hat', 'gloves', 'glasses', 'accessory'];

export type HairStyle = 'short' | 'buzz' | 'long' | 'ponytail' | 'bun' | 'curly' | 'spiky' | 'mohawk' | 'bob' | 'slick' | 'bald';
export const HAIR_STYLES: HairStyle[] = ['short', 'buzz', 'slick', 'spiky', 'curly', 'mohawk', 'bob', 'long', 'ponytail', 'bun', 'bald'];
export const HAIR_COLORS = ['#1a1a1a', '#3a2a1a', '#6a4a2a', '#b0502a', '#e0c060', '#c8c8c8', '#e04020', '#3a6ad8', '#d050a0', '#2ab07a'];
export const SKIN_TONES = ['#f6d7c3', '#e8b896', '#d29a72', '#a8714a', '#7a4c2c', '#4e3020'];
export const FACES = ['Friendly', 'Focused', 'Cheerful', 'Cool'];
export type BodyStyle = 'slim' | 'regular' | 'broad';
export const BODY_STYLES: BodyStyle[] = ['slim', 'regular', 'broad'];

export interface Outfit {
  body: BodyStyle;
  skin: number;
  face: number;
  hairStyle: HairStyle;
  hairColor: string;
  hat: string | null;
  shirt: string;
  pants: string;
  shoes: string;
  gloves: string | null;
  glasses: string | null;
  accessory: string | null;
  bag: string;
}

export interface CosmeticItem {
  id: string;
  name: string;
  slot: CosmeticSlot;
  style: string;
  color: string;
  color2?: string;
  price: number;
  rarity: Rarity;
  collection?: string;
  event?: string;
}

const I = (id: string, name: string, slot: CosmeticSlot, style: string, color: string, color2: string | undefined, price: number, rarity: Rarity, collection?: string, event?: string): CosmeticItem => ({
  id, name, slot, style, color, color2, price, rarity, collection, event,
});

export const COSMETICS: CosmeticItem[] = [
  // hats
  I('hat_cap_navy', 'Navy Cap', 'hat', 'cap', '#1f3a6a', '#ffffff', 0, 'common', 'Clubhouse Basics'),
  I('hat_cap_red', 'Red Cap', 'hat', 'cap', '#d83a3a', '#ffffff', 120, 'common', 'Clubhouse Basics'),
  I('hat_cap_pink', 'Pink Cap', 'hat', 'cap', '#ff7ac0', '#ffffff', 150, 'common'),
  I('hat_visor_white', 'White Visor', 'hat', 'visor', '#f4f4f4', '#2a6ad8', 140, 'common', 'Clubhouse Basics'),
  I('hat_visor_navy', 'Navy Visor', 'hat', 'visor', '#1f3a6a', '#ffffff', 160, 'common'),
  I('hat_bucket_tan', 'Tan Bucket Hat', 'hat', 'bucket', '#c8b08a', undefined, 260, 'uncommon'),
  I('hat_flat_gray', 'Tweed Flat Cap', 'hat', 'flat', '#7a7a7a', '#5a5a5a', 380, 'uncommon', 'Links Heritage'),
  I('hat_beanie_teal', 'Teal Bobble Beanie', 'hat', 'beanie', '#2ad8c0', '#ffffff', 320, 'uncommon'),
  I('hat_cowboy', 'Desert Ranger Hat', 'hat', 'wide', '#8a5a3a', '#3a2a1a', 750, 'rare', 'Desert Nights'),
  I('hat_straw', 'Straw Sun Hat', 'hat', 'wide', '#e8d08a', '#c04040', 620, 'rare', 'Seaside'),
  I('hat_crown', 'Champion Crown', 'hat', 'crown', '#ffc83a', '#d83a3a', 3000, 'legendary', 'Champions'),
  I('hat_headband', 'Sweatband', 'hat', 'headband', '#ffffff', '#d83a3a', 200, 'common'),
  I('hat_pumpkin', 'Pumpkin Beanie', 'hat', 'beanie', '#ff8a1a', '#2a7a2a', 900, 'epic', 'Harvest', 'harvest'),
  // shirts
  I('shirt_polo_white', 'White Polo', 'shirt', 'polo', '#f4f4f4', '#d0d0d0', 0, 'common', 'Clubhouse Basics'),
  I('shirt_polo_sky', 'Sky Polo', 'shirt', 'polo', '#7ac0ff', '#ffffff', 120, 'common', 'Clubhouse Basics'),
  I('shirt_polo_orange', 'Tangerine Polo', 'shirt', 'polo', '#ff8a3a', '#ffffff', 120, 'common'),
  I('shirt_polo_lilac', 'Lilac Polo', 'shirt', 'polo', '#b89ae8', '#ffffff', 140, 'common'),
  I('shirt_polo_mint', 'Mint Polo', 'shirt', 'polo', '#8ae8c0', '#ffffff', 140, 'common'),
  I('shirt_polo_black', 'Midnight Polo', 'shirt', 'polo', '#202428', '#e0b040', 220, 'uncommon'),
  I('shirt_polo_pink', 'Flamingo Polo', 'shirt', 'polo', '#ff7ab0', '#ffffff', 180, 'common'),
  I('shirt_polo_teal', 'Teal Polo', 'shirt', 'polo', '#1aa8a0', '#ffffff', 160, 'common'),
  I('shirt_tee_red', 'Red Tee', 'shirt', 'tee', '#d83a3a', undefined, 100, 'common'),
  I('shirt_stripe_navy', 'Breton Stripes', 'shirt', 'stripe', '#ffffff', '#1f3a6a', 340, 'uncommon', 'Seaside'),
  I('shirt_argyle_red', 'Argyle Sweater', 'shirt', 'argyle', '#c03a3a', '#f0d080', 480, 'uncommon', 'Links Heritage'),
  I('shirt_vest_green', 'Club Vest', 'shirt', 'vest', '#2a6a3a', '#f4f4f4', 520, 'rare', 'Links Heritage'),
  I('shirt_hawaii', 'Aloha Shirt', 'shirt', 'floral', '#2ab0c0', '#ffd23a', 680, 'rare', 'Seaside'),
  I('shirt_flame', 'Inferno Polo', 'shirt', 'flame', '#202020', '#ff5a1a', 1400, 'epic', 'Desert Nights'),
  I('shirt_gold', 'Gilded Champion Polo', 'shirt', 'stripe', '#fff4d0', '#e0a820', 2600, 'legendary', 'Champions'),
  I('shirt_harvest', 'Harvest Plaid', 'shirt', 'argyle', '#a0401a', '#f0a030', 950, 'epic', 'Harvest', 'harvest'),
  // pants
  I('pants_khaki', 'Khaki Chinos', 'pants', 'pants', '#c8b48a', undefined, 0, 'common', 'Clubhouse Basics'),
  I('pants_navy', 'Navy Trousers', 'pants', 'pants', '#1f2f5a', undefined, 120, 'common'),
  I('pants_white', 'White Trousers', 'pants', 'pants', '#f0f0f0', undefined, 140, 'common'),
  I('pants_charcoal', 'Charcoal Trousers', 'pants', 'pants', '#3a3e44', undefined, 120, 'common'),
  I('pants_black', 'Black Trousers', 'pants', 'pants', '#18181c', undefined, 140, 'common'),
  I('shorts_black', 'Black Shorts', 'pants', 'shorts', '#202024', undefined, 110, 'common'),
  I('shorts_khaki', 'Khaki Shorts', 'pants', 'shorts', '#c8b48a', undefined, 110, 'common'),
  I('pants_skirt_navy', 'Navy Skort', 'pants', 'skirt', '#1f2f5a', undefined, 160, 'common'),
  I('pants_plaid', 'Loud Plaid Trousers', 'pants', 'plaid', '#d83a3a', '#203a80', 560, 'rare', 'Links Heritage'),
  I('pants_knickers', 'Plus-Fours', 'pants', 'plaid', '#8a7a5a', '#4a3a2a', 820, 'rare', 'Links Heritage'),
  I('pants_gold', 'Champion Slacks', 'pants', 'pants', '#e0b030', undefined, 2200, 'legendary', 'Champions'),
  // shoes
  I('shoes_white', 'Classic Whites', 'shoes', 'golf', '#f4f4f4', '#2a2a2a', 0, 'common', 'Clubhouse Basics'),
  I('shoes_black', 'Black Brogues', 'shoes', 'golf', '#1a1a1a', '#f4f4f4', 140, 'common'),
  I('shoes_saddle', 'Saddle Shoes', 'shoes', 'golf', '#f4f4f4', '#6a3a1a', 320, 'uncommon', 'Links Heritage'),
  I('shoes_neon', 'Neon Runners', 'shoes', 'sport', '#c8ff3a', '#202020', 480, 'rare'),
  I('shoes_gold', 'Golden Spikes', 'shoes', 'golf', '#ffc83a', '#ffffff', 1800, 'epic', 'Champions'),
  // gloves
  I('glove_white', 'White Glove', 'gloves', 'glove', '#f4f4f4', undefined, 80, 'common'),
  I('glove_black', 'Black Glove', 'gloves', 'glove', '#1a1a1a', undefined, 120, 'common'),
  I('glove_red', 'Red Glove', 'gloves', 'glove', '#d83a3a', undefined, 150, 'uncommon'),
  I('glove_gold', 'Golden Glove', 'gloves', 'glove', '#ffc83a', undefined, 1200, 'epic', 'Champions'),
  // glasses
  I('glasses_shades', 'Classic Shades', 'glasses', 'shades', '#101010', undefined, 220, 'common'),
  I('glasses_sport', 'Sport Wraps', 'glasses', 'sport', '#ff5a1a', '#202020', 380, 'uncommon'),
  I('glasses_round', 'Round Specs', 'glasses', 'round', '#c0a060', undefined, 300, 'uncommon'),
  I('glasses_star', 'Star Shades', 'glasses', 'star', '#ff4ab0', undefined, 900, 'rare'),
  // accessories
  I('acc_towel', 'Caddie Towel', 'accessory', 'towel', '#f4f4f4', '#2a6ad8', 90, 'common'),
  I('acc_watch', 'Gold Watch', 'accessory', 'watch', '#ffc83a', undefined, 420, 'uncommon'),
  I('acc_chain', 'Chunky Chain', 'accessory', 'chain', '#ffd23a', undefined, 650, 'rare'),
  I('acc_wristband', 'Wristbands', 'accessory', 'wristband', '#2ad8a0', undefined, 140, 'common'),
  I('acc_cape', 'Hero Cape', 'accessory', 'cape', '#d83a3a', '#ffc83a', 2800, 'legendary', 'Champions'),
  I('acc_scarf', 'Highland Scarf', 'accessory', 'scarf', '#2a6a3a', '#d83a3a', 700, 'rare', 'Highlands'),
  // bags
  I('bag_basic', 'Canvas Carry Bag', 'bag', 'carry', '#3a6a3a', '#c8b48a', 0, 'common', 'Clubhouse Basics'),
  I('bag_blue', 'Blue Stand Bag', 'bag', 'stand', '#2a5ad8', '#ffffff', 260, 'common'),
  I('bag_red', 'Red Stand Bag', 'bag', 'stand', '#d83a3a', '#202020', 260, 'common'),
  I('bag_tour', 'Tour Staff Bag', 'bag', 'staff', '#202020', '#e0b040', 900, 'rare'),
  I('bag_retro', 'Leather Heritage Bag', 'bag', 'carry', '#6a3a1a', '#e0c080', 620, 'uncommon', 'Links Heritage'),
  I('bag_gold', 'Gilded Staff Bag', 'bag', 'staff', '#ffc83a', '#ffffff', 2400, 'legendary', 'Champions'),
  I('bag_harvest', 'Harvest Bag', 'bag', 'staff', '#ff8a1a', '#3a2a1a', 1100, 'epic', 'Harvest', 'harvest'),
];

export const cosmeticById = (id: string | null | undefined) => (id ? COSMETICS.find((c) => c.id === id) : undefined);
export const STARTER_COSMETICS = COSMETICS.filter((c) => c.price === 0).map((c) => c.id);

export const DEFAULT_OUTFIT: Outfit = {
  body: 'regular',
  skin: 1,
  face: 0,
  hairStyle: 'short',
  hairColor: '#3a2a1a',
  hat: 'hat_cap_navy',
  shirt: 'shirt_polo_white',
  pants: 'pants_khaki',
  shoes: 'shoes_white',
  gloves: null,
  glasses: null,
  accessory: null,
  bag: 'bag_basic',
};
