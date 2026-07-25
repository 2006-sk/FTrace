/**
 * Tiled-compatible map (orthogonal / pixel-art city).
 * Open in Tiled → New tileset pointing at /tiles/city-tiles.png (generated at runtime too).
 * Tile indices: 0 empty, 1 grass, 2 road, 3 sidewalk, 4 building footprint
 */
export const CITY_MAP = {
  compressionlevel: -1,
  height: 18,
  width: 18,
  tilewidth: 32,
  tileheight: 32,
  infinite: false,
  orientation: "orthogonal",
  renderorder: "right-down",
  type: "map",
  version: "1.10",
  tiledversion: "1.10.2",
  layers: [
    {
      id: 1,
      name: "ground",
      type: "tilelayer",
      width: 18,
      height: 18,
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      data: buildCityGround(),
    },
    {
      id: 2,
      name: "objects",
      type: "objectgroup",
      visible: true,
      opacity: 1,
      objects: [],
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: "city",
      tilewidth: 32,
      tileheight: 32,
      tilecount: 8,
      columns: 8,
      image: "city-tiles.png",
      imagewidth: 256,
      imageheight: 32,
    },
  ],
}

function buildCityGround() {
  const w = 18
  const h = 18
  const data = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const road = x === 8 || x === 9 || y === 8 || y === 9 || y === 3
      if (road) data.push(2)
      else if ((x + y) % 5 === 0) data.push(3)
      else data.push(1)
    }
  }
  return data
}

export const RESTAURANT_MAP = {
  compressionlevel: -1,
  height: 14,
  width: 16,
  tilewidth: 32,
  tileheight: 32,
  infinite: false,
  orientation: "orthogonal",
  renderorder: "right-down",
  type: "map",
  version: "1.10",
  tiledversion: "1.10.2",
  layers: [
    {
      id: 1,
      name: "floor",
      type: "tilelayer",
      width: 16,
      height: 14,
      visible: true,
      opacity: 1,
      data: buildRestaurantFloor(),
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: "interior",
      tilewidth: 32,
      tileheight: 32,
      tilecount: 8,
      columns: 8,
      image: "interior-tiles.png",
      imagewidth: 256,
      imageheight: 32,
    },
  ],
}

function buildRestaurantFloor() {
  const w = 16
  const h = 14
  const data = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // walls
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) data.push(5)
      // kitchen zone
      else if (x >= 11 && y <= 6) data.push(6)
      // outdoor strip
      else if (y >= 12) data.push(1)
      else data.push(4)
    }
  }
  return data
}
