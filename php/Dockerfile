FROM php:8.3-apache
RUN docker-php-ext-install mysqli && a2enmod rewrite headers \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/application/cache /var/www/html/application/logs
EXPOSE 80
