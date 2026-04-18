#[macro_use] extern crate rocket;

use rocket::fairing::{Fairing, Info, Kind};
use rocket::fs::{FileServer, relative};
use rocket::http::Header;
use rocket::{Request, Response};

struct CacheControl;

#[rocket::async_trait]
impl Fairing for CacheControl {
    fn info(&self) -> Info {
        Info { name: "Cache-Control", kind: Kind::Response }
    }

    async fn on_response<'r>(&self, req: &'r Request<'_>, res: &mut Response<'r>) {
        let path = req.uri().path().as_str();
        let value = match path.rsplit_once('.').map(|(_, ext)| ext) {
            Some("css" | "js") => "public, max-age=3600",
            Some("png" | "webp" | "jpg" | "jpeg" | "gif" | "svg" | "ico"
                | "pdf" | "woff" | "woff2" | "ttf" | "otf") => "public, max-age=604800",
            _ => "public, max-age=300",
        };
        res.set_header(Header::new("Cache-Control", value));
    }
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(CacheControl)
        .mount("/", FileServer::from(relative!("static")))
}
