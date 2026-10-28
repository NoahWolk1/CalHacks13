import { describe, expect, it } from "vitest";
import { photoNote } from "./run";

describe("the attached photo in the question", () => {
  it("adds what the photo shows and where it was placed, citing the finding", () => {
    const note = photoNote(["Reading the photo…", "Photo: A Victorian corner shop under a Masonic street sign."],
      [{ id: "F1", geometry: { type: "Point", coordinates: [-122.44535, 37.77022] }, props: { place: "Masonic Avenue & Haight Street" } }]);
    expect(note).toBe("Attached photo: A Victorian corner shop under a Masonic street sign. Most likely taken at Masonic Avenue & Haight Street (37.77022, -122.44535) [F1].");
  });
  it("says when the photo is outside the area, or couldn't be placed", () => {
    expect(photoNote([], [{ id: "F2", geometry: { type: "Point", coordinates: [13.6, 47.5] }, props: { place: "Hallstatt", offRegion: true } }])).toContain(", outside the selected area.");
    expect(photoNote(["Photo: A blurry wall."], [])).toBe("Attached photo: A blurry wall. It couldn't be placed.");
    expect(photoNote([], [])).toBeNull();
  });
});
