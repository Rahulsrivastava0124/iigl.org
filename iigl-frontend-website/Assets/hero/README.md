# Page header photographs

The picture behind each page's navy header. Downloaded from Unsplash, whose
licence allows commercial use without permission or attribution, and kept in
the repository rather than hotlinked: a header that waits on someone else's CDN
is a header that can arrive late, or not at all, and the file is served from the
same origin as the rest of the build.

Each is cropped to 1920 x 700 and saved at quality 62, which is what a header
at this size needs — the wash over it hides finer detail than that.

| file              | page                        | source                                                   |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| `about.jpg`       | About Us                    | unsplash.com/photos/-/photo-1660860548716-a750ac5b2bbc   |
| `affiliation.jpg` | Affiliations                | unsplash.com/photos/-/photo-1578531500970-6326bbc991bf   |
| `certificate.jpg` | Importance of a Certificate | unsplash.com/photos/-/photo-1750767323874-5946ad2c7e91   |
| `contact.jpg`     | Contact Us                  | unsplash.com/photos/-/photo-1622704776938-bed6cd156e04   |
| `blog.jpg`        | GemBlog                     | unsplash.com/photos/-/photo-1592317295760-5c1f677dfc78   |
| `education.jpg`   | Education                   | unsplash.com/photos/-/photo-1627234553051-3d60e738b534   |
| `verify.jpg`      | Verify Report               | unsplash.com/photos/-/photo-1645201233154-80125533a32c   |

To replace one, keep the file name and the crop; the component imports it by
name and nothing else needs changing. A photograph with its subject in the
middle works best, because the heading sits over the centre.
