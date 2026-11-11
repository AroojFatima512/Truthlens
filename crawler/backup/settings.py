# Scrapy settings for the TruthLens project

BOT_NAME = "truthlens"

SPIDER_MODULES = ["truthlens.spiders"]
NEWSPIDER_MODULE = "truthlens.spiders"

ADDONS = {}

# Identify the crawler
USER_AGENT = "TruthLensResearchBot/0.1"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Request concurrency
CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1

# Request delays and timeout
DOWNLOAD_DELAY = 3
DOWNLOAD_DELAY_JITTER = 0.5
DOWNLOAD_TIMEOUT = 30

# Retry failed requests
RETRY_ENABLED = True
RETRY_TIMES = 2

# Export settings
FEED_EXPORT_ENCODING = "utf-8"
FEED_EXPORT_INDENT = 2

# Item pipelines
ITEM_PIPELINES = {
    "truthlens.pipelines.CleaningPipeline": 100,
    "truthlens.pipelines.MongoDBPipeline": 300,
}

MONGO_URI = "mongodb://localhost:27017/"
MONGO_DATABASE = "truthlens"


# Logging
LOG_LEVEL = "INFO"

# Optional settings below remain disabled/commented out.

# Disable cookies (enabled by default)
# COOKIES_ENABLED = False

# Disable Telnet Console (enabled by default)
# TELNETCONSOLE_ENABLED = False

# Override default request headers
# DEFAULT_REQUEST_HEADERS = {
#     "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
#     "Accept-Language": "en",
# }

# Spider middlewares
# SPIDER_MIDDLEWARES = {
#     "truthlens.middlewares.TruthlensSpiderMiddleware": 543,
# }

# Downloader middlewares
# DOWNLOADER_MIDDLEWARES = {
#     "truthlens.middlewares.TruthlensDownloaderMiddleware": 543,
# }

# Extensions
# EXTENSIONS = {
#     "scrapy.extensions.telnet.TelnetConsole": None,
# }

# AutoThrottle
# AUTOTHROTTLE_ENABLED = True
# AUTOTHROTTLE_START_DELAY = 5
# AUTOTHROTTLE_MAX_DELAY = 60
# AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
# AUTOTHROTTLE_DEBUG = False

# HTTP caching
# HTTPCACHE_ENABLED = True
# HTTPCACHE_EXPIRATION_SECS = 0
# HTTPCACHE_DIR = "httpcache"
# HTTPCACHE_IGNORE_HTTP_CODES = []
# HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"