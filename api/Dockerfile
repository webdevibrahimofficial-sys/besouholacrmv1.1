# Dockerfile
FROM php:8.3-fpm

WORKDIR /var/www

# تثبيت الامتدادات المطلوبة
RUN apt-get update && apt-get install -y \
    libonig-dev \
    libzip-dev \
    unzip \
    git \
    curl \
    && docker-php-ext-install pdo_mysql mbstring zip exif pcntl bcmath

RUN { \
    echo 'post_max_size=64M'; \
    echo 'upload_max_filesize=64M'; \
    echo 'memory_limit=512M'; \
    echo 'max_execution_time=600'; \
    echo 'max_input_time=600'; \
  } > "$PHP_INI_DIR/conf.d/zz-crm-imports.ini" \
  && { \
    echo '[www]'; \
    echo 'pm.max_children=20'; \
    echo 'pm.start_servers=4'; \
    echo 'pm.min_spare_servers=2'; \
    echo 'pm.max_spare_servers=8'; \
  } > /usr/local/etc/php-fpm.d/zz-crm-pool.conf

COPY . /var/www

RUN chown -R www-data:www-data /var/www

CMD ["php-fpm"]
