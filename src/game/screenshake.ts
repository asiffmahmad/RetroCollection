export class ScreenShake {
  private intensity = 0;
  private duration = 0;
  private elapsed = 0;
  public offsetX = 0;
  public offsetY = 0;

  shake(intensity: number, duration: number) {
    this.intensity = intensity;
    this.duration = duration;
    this.elapsed = 0;
  }

  update() {
    if (this.elapsed < this.duration) {
      const progress = this.elapsed / this.duration;
      const damping = 1 - progress;
      const amount = this.intensity * damping;
      this.offsetX = (Math.random() * 2 - 1) * amount;
      this.offsetY = (Math.random() * 2 - 1) * amount;
      this.elapsed++;
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  get isShaking() {
    return this.elapsed < this.duration;
  }
}
