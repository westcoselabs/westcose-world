type Point = { x: number; y: number; z: number };

/** Conservative perspective occlusion against an opaque sphere centered at world origin. */
export class PlanetOcclusion {
  private nx = 0;
  private ny = 0;
  private nz = 0;
  private distance = 0;
  private horizon = 0;
  private sinAngle = 0;
  private cosAngle = 1;
  private active = false;

  constructor(readonly planetRadius: number) {}

  /** Compute the occluder's tangent plane and silhouette cone once per frame. */
  setCamera(camera: Point) {
    const distance = Math.hypot(camera.x, camera.y, camera.z);
    this.active = Number.isFinite(distance) && distance > this.planetRadius + 0.001;
    if (!this.active) return;
    this.distance = distance;
    this.nx = camera.x / distance; this.ny = camera.y / distance; this.nz = camera.z / distance;
    this.horizon = this.planetRadius * this.planetRadius / distance;
    this.sinAngle = this.planetRadius / distance;
    this.cosAngle = Math.sqrt(Math.max(0, 1 - this.sinAngle * this.sinAngle));
  }

  isSphereHidden(center: Point, radius: number) {
    if (!this.active || !Number.isFinite(radius) || radius < 0) return false;
    // Inflate the complete instance bound slightly; touching either boundary stays visible.
    const paddedRadius = radius + 0.05;
    const axial = center.x * this.nx + center.y * this.ny + center.z * this.nz;
    if (!Number.isFinite(axial) || axial + paddedRadius >= this.horizon) return false;
    const perpendicular = Math.sqrt(Math.max(0, center.x * center.x + center.y * center.y + center.z * center.z - axial * axial));
    const along = this.distance - axial;
    // Signed distance to the silhouette cone must contain the entire bounding sphere.
    // Combined with the tangent-plane test, every camera ray to this bound hits land first.
    return along * this.sinAngle - perpendicular * this.cosAngle > paddedRadius;
  }
}
