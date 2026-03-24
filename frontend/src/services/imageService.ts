/**
 * Abstraction over image data sources.
 * Replace MockImageService with a real implementation (S3, custom API, etc.)
 * without touching any component code.
 */

export interface ImageSource {
  id: string;
  url: string;
  name?: string;
}

export interface ImageService {
  getImage(id: string): Promise<ImageSource>;
  listImages(): Promise<ImageSource[]>;
}

export class MockImageService implements ImageService {
  private readonly images: ImageSource[] = [
    {
      id: '1',
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
      name: 'Sample 1',
    },
    {
      id: '2',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Docker_%28container_engine%29_logo.svg/1920px-Docker_%28container_engine%29_logo.svg.png',
      name: 'Sample 2',
    },
  ];

  async getImage(id: string): Promise<ImageSource> {
    const img = this.images.find(i => i.id === id);
    if (!img) throw new Error(`Image not found: ${id}`);
    return img;
  }

  async listImages(): Promise<ImageSource[]> {
    return [...this.images];
  }
}

export const imageService: ImageService = new MockImageService();
