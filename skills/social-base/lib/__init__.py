"""Ayudas compartidas de las skills social-* de v!d by Kold.Gold.

Adaptado de Instagram Skills (Sergey Bulaev, MIT; ver ../NOTICE.md). En v!d no se publica con Publora ni se generan
imagenes con Pixfaro: se publica con vid-api (../publicar.mjs, siempre en borrador). Lo que queda aqui es la lectura:
el parser de URLs de Instagram, la tarjeta de aprobacion y el cliente de Apify (solo con APIFY_TOKEN, de pago por uso).
El cliente de Apify necesita `requests`; se importa solo al pedirlo.
"""
from ._env import load_env

load_env()

from .url_parser import parse_instagram_url
from .approval import render_approval_card


def __getattr__(nombre):
    if nombre in ("ApifyClient", "ApifyError", "ApifyAuthError"):
        from . import apify_client

        return getattr(apify_client, nombre)
    raise AttributeError(nombre)


__all__ = ["parse_instagram_url", "render_approval_card", "ApifyClient", "ApifyError", "ApifyAuthError"]
