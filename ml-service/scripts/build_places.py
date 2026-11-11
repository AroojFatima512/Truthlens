r"""Build app/data/places.tsv, the place list used when grouping articles into stories.

    pip install geonamescache          # only needed to rebuild the list, not to run the service
    python scripts\build_places.py

Sources (general reference data, not taken from crawled news):
  * GeoNames (via the geonamescache package, data CC BY 4.0 geonames.org):
      - every country,
      - every city in the world with 100,000+ people, mapped to its country,
      - every place in Pakistan with 500+ people.
  * Pakistan's provinces, territories, divisions and districts (PAKISTAN_ADMIN below), because GeoNames'
    town list does not include district names such as Kurram or South Waziristan.

Output columns: name <TAB> canonical name <TAB> country (empty for Pakistan and for countries themselves).
"""
from pathlib import Path

import geonamescache

OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "places.tsv"

PAKISTAN_ADMIN = """
Punjab|Sindh|Khyber Pakhtunkhwa|Balochistan|Gilgit-Baltistan|Azad Jammu and Kashmir|Azad Kashmir|
Islamabad Capital Territory|Islamabad|Federally Administered Tribal Areas|FATA|Waziristan|Malakand Division|
Hazara Division|Makran|Thar|Tirah|Tirah Valley|Cholistan|Potohar|Siachen|Torkham|Chaman|Wagah|Kachhi|
Attock|Bahawalnagar|Bahawalpur|Bhakkar|Chakwal|Chiniot|Dera Ghazi Khan|Faisalabad|Gujranwala|Gujrat|Hafizabad|
Jhang|Jhelum|Kasur|Khanewal|Khushab|Lahore|Layyah|Lodhran|Mandi Bahauddin|Mianwali|Multan|Muzaffargarh|
Nankana Sahib|Narowal|Okara|Pakpattan|Rahim Yar Khan|Rajanpur|Rawalpindi|Sahiwal|Sargodha|Sheikhupura|
Sialkot|Toba Tek Singh|Vehari|Talagang|Murree|Kot Addu|Taunsa|Wazirabad|
Badin|Dadu|Ghotki|Hyderabad|Jacobabad|Jamshoro|Karachi|Karachi Central|Karachi East|Karachi South|Karachi West|
Korangi|Malir|Keamari|Kashmore|Khairpur|Larkana|Matiari|Mirpur Khas|Mirpurkhas|Naushahro Feroze|
Shaheed Benazirabad|Benazirabad|Nawabshah|Qambar Shahdadkot|Sanghar|Shikarpur|Sujawal|Sukkur|Tando Allahyar|
Tando Muhammad Khan|Tharparkar|Thatta|Umerkot|
Abbottabad|Bajaur|Bannu|Battagram|Buner|Charsadda|Chitral|Upper Chitral|Lower Chitral|Dera Ismail Khan|Hangu|
Haripur|Karak|Khyber|Kohat|Kohistan|Upper Kohistan|Lower Kohistan|Kolai Palas|Kurram|Upper Kurram|
Lower Kurram|Central Kurram|Parachinar|Lakki Marwat|Lower Dir|Upper Dir|Dir|Malakand|Mansehra|Mardan|Mohmand|
North Waziristan|South Waziristan|Upper South Waziristan|Lower South Waziristan|Miranshah|Mir Ali|Wana|
Nowshera|Orakzai|Peshawar|Shangla|Swabi|Swat|Tank|Torghar|Darazinda|
Awaran|Barkhan|Chagai|Dera Bugti|Duki|Gwadar|Harnai|Hub|Jafarabad|Jaffarabad|Jhal Magsi|Kalat|Kech|Turbat|
Kharan|Khuzdar|Killa Abdullah|Killa Saifullah|Kohlu|Lasbela|Loralai|Mastung|Musakhel|Nasirabad|Nushki|
Noshki|Panjgur|Pishin|Quetta|Sherani|Sibi|Sohbatpur|Surab|Usta Muhammad|Washuk|Zhob|Ziarat|Dalbandin|
Gilgit|Skardu|Hunza|Nagar|Ghizer|Ghanche|Shigar|Kharmang|Astore|Diamer|Chilas|Darel|Tangir|Roundu|Gupis|Yasin|
Muzaffarabad|Neelum|Jhelum Valley|Bagh|Haveli|Poonch|Sudhnoti|Kotli|Mirpur|Bhimber|Rawalakot
"""


def main():
    gc = geonamescache.GeonamesCache(min_city_population=500)
    countries = gc.get_countries()
    rows = {}

    def add(name, canonical, country=""):
        name = " ".join(name.split())
        if len(name) >= 3 and name.lower() not in rows:
            rows[name.lower()] = (name, canonical.lower(), country.lower())

    for name in filter(None, (n.strip() for n in PAKISTAN_ADMIN.replace("\n", "").split("|"))):
        add(name, name)
    for c in countries.values():
        add(c["name"], c["name"])
    for city in gc.get_cities().values():
        cc = city["countrycode"]
        if cc == "PK":
            add(city["name"], city["name"])
        elif city["population"] >= 100_000 and cc in countries:
            add(city["name"], city["name"], countries[cc]["name"])
    for c in countries.values():                       # capitals, even small ones
        if c.get("capital"):
            add(c["capital"], c["capital"], c["name"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("# name\tcanonical\tcountry  (built by scripts/build_places.py from GeoNames + Pakistan's districts)\n")
        for name, canonical, country in sorted(rows.values()):
            f.write(f"{name}\t{canonical}\t{country}\n")
    print(f"{len(rows)} places written to {OUT}")


if __name__ == "__main__":
    main()
