#!/bin/bash

echo "📋 Rollback script for $1 environment"
echo "⚠️  This would revert to the previous deployment"
echo "Usage: bash rollback.sh [environment]"
echo ""
echo "Available commands:"
echo "  docker-compose stop          # Stop all containers"
echo "  docker-compose down          # Remove all containers"
echo "  docker system prune          # Clean up unused images/volumes"
