/**
 * Spotify Web API integration for fetching album and track data
 */

interface SpotifyTrack {
  name: string;
  duration_ms: number;
  track_number: number;
  id: string;
  preview_url: string | null;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  release_date: string;
  total_tracks: number;
  images: Array<{ url: string; height: number; width: number }>;
  tracks: {
    items: SpotifyTrack[];
  };
  external_urls: {
    spotify: string;
  };
}

interface SpotifyAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get Spotify access token using Client Credentials flow
 */
async function getSpotifyAccessToken(): Promise<string> {
  const clientId = import.meta.env.SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Spotify credentials. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env file'
    );
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Spotify access token: ${response.status} ${response.statusText}`);
  }

  const data: SpotifyAuthResponse = await response.json();
  return data.access_token;
}

/**
 * Fetch album data from Spotify
 */
export async function fetchSpotifyAlbum(albumId: string): Promise<SpotifyAlbum | null> {
  try {
    const accessToken = await getSpotifyAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch album from Spotify: ${response.status} ${response.statusText}`);
      return null;
    }

    const album: SpotifyAlbum = await response.json();
    return album;
  } catch (error) {
    console.error('Error fetching Spotify album:', error);
    return null;
  }
}

/**
 * Format duration from milliseconds to MM:SS
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format total album duration from milliseconds to HH:MM:SS or MM:SS
 */
export function formatTotalDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the highest quality album artwork URL
 */
export function getAlbumArtwork(album: SpotifyAlbum): string | null {
  if (!album.images || album.images.length === 0) {
    return null;
  }
  // Images are sorted by size, first one is usually the largest
  return album.images[0].url;
}

/**
 * Transform Spotify album data to our release format
 */
export function transformSpotifyAlbumToRelease(album: SpotifyAlbum) {
  const totalDurationMs = album.tracks.items.reduce((sum, track) => sum + track.duration_ms, 0);

  return {
    title: album.name,
    artist: album.artists[0].name,
    releaseDate: album.release_date,
    year: parseInt(album.release_date.split('-')[0]),
    tracklist: album.tracks.items.map((track) => ({
      title: track.name,
      duration: formatDuration(track.duration_ms),
      trackNumber: track.track_number,
      previewUrl: track.preview_url,
    })),
    duration: formatTotalDuration(totalDurationMs),
    artwork: getAlbumArtwork(album),
    spotifyUrl: album.external_urls.spotify,
  };
}
