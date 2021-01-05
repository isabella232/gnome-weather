const { Gio, GLib, GWeather, GObject, Gtk, Gdk } = imports.gi;

const LocationItem = GObject.registerClass(
    {
        Properties: {
            'display-name': GObject.ParamSpec.string("display-name", "Display name", "", GObject.ParamFlags.READWRITE, ''),
            'location': GObject.ParamSpec.boxed("location", "Display name", "", GObject.ParamFlags.READWRITE, GWeather.Location.$gtype),
            'local-compare-name': GObject.ParamSpec.string("local-compare-name", "Local compare name", "", GObject.ParamFlags.READWRITE, ''),
            'english-compare-name': GObject.ParamSpec.string("english-compare-name", "English compare name", "", GObject.ParamFlags.READWRITE, ''),
        }
    },
    class LocationItem extends GObject.Object { }
);

/**
 * @param {string} displayName
 * @param {import("@gi-types/gweather").Location} location
 * @param {string} localCompareName
 * @param {string} englishCompareName
 */
function buildLocationItem(displayName, location, localCompareName, englishCompareName) {
    const item = new LocationItem();
    item.displayName = displayName;
    item.location = location;
    item.localCompareName = localCompareName;
    item.englishCompareName = englishCompareName;
    return item;
}

/** @typedef {import("@gi-types/gio").ListModel} ListModel */

const LocationListModel = GObject.registerClass(
    {
        Implements: [Gio.ListModel]
    },
    class LocationListModel extends GObject.Object {
        /** @type {Array<typeof LocationItem.prototype>} */
        _list = [];
        _show_named_timezones = false;

        /**
         * @param {*} klass
         */
        _initClass(klass) {
            const lm = new Gtk.BinLayout();
            klass.set_layout_manager(lm);
            klass.set_css_name('entry');
        }

        _init() {
            super._init();

            this._top = GWeather.Location.get_world();
            this._show_named_timezones = false;

            this._list = [];
        }

        // TODO
        // Adapted from libgweather

        /**
         * @param {import("@gi-types/gweather").Location} loc
         * @param {string | null} parent_display_name
         * @param {string | null} parent_compare_local_name
         * @param {string | null} parent_compare_english_name
         * @param {boolean} show_named_timezones
         */
        _fill_location_list_model(
            loc,
            parent_display_name,
            parent_compare_local_name,
            parent_compare_english_name,
            show_named_timezones
        ) {
            let children = loc.get_children();
            /** @type {string | null} */
            let display_name;
            /** @type {string | null} */
            let local_compare_name;
            /** @type {string | null} */
            let english_compare_name;

            switch (loc.get_level()) {
                case GWeather.LocationLevel.WORLD:
                case GWeather.LocationLevel.REGION:
                    /* Ignore these levels of hierarchy; just recurse, passing on
                     * the names from the parent node.
                     */
                    children.forEach(child => {
                        this._fill_location_list_model(child,
                            parent_display_name,
                            parent_compare_local_name,
                            parent_compare_english_name,
                            show_named_timezones);
                    });
                    break;

                case GWeather.LocationLevel.COUNTRY:
                    /* Recurse, initializing the names to the country name */
                    children.forEach(child => {
                        this._fill_location_list_model(child,
                            loc.get_name(),
                            loc.get_sort_name(),
                            loc.get_english_name(),
                            show_named_timezones);
                    });
                    break;

                case GWeather.LocationLevel.ADM1:
                    /* Recurse, adding the ADM1 name to the country name */
                    /* Translators: this is the name of a location followed by a region, for example:
                     * 'London, United Kingdom'
                     * You shouldn't need to translate this string unless the language has a different comma.
                     */
                    display_name = _("%s, %s").format(loc.get_name(), parent_display_name);
                    local_compare_name = _("%s, %s").format(loc.get_sort_name(), parent_compare_local_name);
                    english_compare_name = _("%s, %s").format(loc.get_english_name(), parent_compare_english_name);

                    children.forEach(child => {
                        this._fill_location_list_model(child,
                            display_name, local_compare_name, english_compare_name,
                            show_named_timezones);
                    });

                    break;

                case GWeather.LocationLevel.CITY:
                /* If there are multiple (<location>) children, we use the one
                 * closest to the city center.
                 *
                 * Locations are already sorted by increasing distance from
                 * the city.
                 */
                case GWeather.LocationLevel.WEATHER_STATION:
                    /* <location> with no parent <city> */
                    /* Translators: this is the name of a location followed by a region, for example:
                     * 'London, United Kingdom'
                     * You shouldn't need to translate this string unless the language has a different comma.
                     */
                    display_name = _("%s, %s").format(
                        loc.get_name(), parent_display_name);
                    local_compare_name = _("%s, %s").format(
                        loc.get_sort_name(), parent_compare_local_name);
                    english_compare_name = _("%s, %s").format(
                        loc.get_english_name(), parent_compare_english_name);

                    this._list.push(buildLocationItem(display_name, loc, local_compare_name, english_compare_name));
                    break;
                case GWeather.LocationLevel.NAMED_TIMEZONE:
                    if (show_named_timezones) {
                        this._list.push(buildLocationItem(loc.get_name(), loc, loc.get_sort_name(), loc.get_english_sort_name()));
                    }
                    break;

                case GWeather.LocationLevel.DETACHED:
                    throw new Error('No detached locations!');
            }
        }

        /**
         * @this {ListModel & this}
         */
        fill() {
            if (!this._top) {
                throw new Error('Failed to load location data');
            }

            this._fill_location_list_model(this._top, null, null, null, this._show_named_timezones);
            this.items_changed(0, 0, this._list.length);
        }

        vfunc_get_item_type() {
            return LocationItem.$gtype;
        }

        vfunc_get_n_items() {
            return this._list.length;
        }

        /**
         * @param {number} n 
         */
        vfunc_get_item(n) {
            return this._list[n] ?? null;
        }
    }
);

var LocationSearchEntry = GObject.registerClass(
    {
        Properties: {
            'location': GObject.ParamSpec.boxed("location", "location", "location", GObject.ParamFlags.READWRITE, GWeather.Location.$gtype)
        }
    },
    class LocationSearchEntry extends Gtk.Widget {
        constructor() {
            super();

            /** @type {import("@gi-types/gtk").SearchEntry} */
            this._entry;
        }

        set location(loc) {
            this._location = loc;
        }

        get location() {
            return this._location;
        }

        /**
         * @param {import("@gi-types/gtk").Orientation} orientation
         * @param {number} for_size
         */
        vfunc_measure(orientation, for_size) {
            return this._entry.measure(orientation, for_size);
        }

        /**
         * @param {number} width
         * @param {number} height
         * @param {number} baseline
         */
        vfunc_size_allocate(width, height, baseline) {
            this._entry.size_allocate(new Gdk.Rectangle({
                x: 0,
                y: 0,
                width,
                height
            }), baseline);

            if (this._popup) {
                this._popup.set_size_request(this.get_allocation().width, -1);
                this._popup.queue_resize();
                this._popup.present();
            }
        }

        vfunc_grab_focus() {
            return this._entry.grab_focus();
        }

        /**
         * @param {import("@gi-types/gtk").ListView} listview 
         */
        set_list_view(listview) {
            if (this._listview) {
                this._listview.set_factory(null);
                this._listview.set_model(null);
                this._listview.unparent();
            }

            this._listview = listview;
            const factory = this._build_factory();
            listview.set_factory(factory);
            const selection = this._build_model();
            listview.set_model(selection);
        }

        onSearch(cb) {
            this.cb = cb;
        }

        ensure_list_view() {
            if (!this._listview) {
                this._popup = new Gtk.Popover();
                this._popup.set_parent(this);
                this._popup.set_autohide(false);
                this._popup.set_has_arrow(false);

                this._listview = new Gtk.ListView();
                const selection = this._build_model();
                this._listview.set_model(selection);
                const factory = this._build_factory();
                this._listview.set_factory(factory);
                this._sw = new Gtk.ScrolledWindow();
                this._sw.set_child(this._listview);
                this._sw.set_hexpand(true);
                this._popup.set_child(this._sw);
                return this._listview;
            }

            return this._listview;
        }

        _build_model() {
            let filter = new Gtk.StringFilter();
            this._filter = filter;
            const expr = Gtk.ClosureExpression.new(GObject.TYPE_STRING, (self) => {
                return self.displayName ?? "";
            }, []);
            filter.set_expression(expr);

            let filter_model = new Gtk.FilterListModel({
                model: this._model,
                filter: this._filter
            });
            let selection = new Gtk.SingleSelection({
                model: filter_model
            });
            selection.set_selected(GLib.MAXUINT32)
            selection.set_autoselect(false);
            selection.connect('notify::selected', (selection, position) => {
                const model = selection.get_model();
                const item = model.get_item(position);
                if (item instanceof LocationItem) {
                    this._set_location(item.location);

                    if (this._popup) {
                        this._popup.popdown();
                    }
                }
            });
            return selection;
        }

        _build_factory() {
            let factory = new Gtk.SignalListItemFactory();
            this._setupId = factory.connect("setup", (source, item) => {
                const label = new Gtk.Label();
                item.set_child(label);
            });
            this._bindId = factory.connect("bind", (source, listitem) => {
                const label = listitem.get_child();
                /** @type {typeof LocationItem.prototype} */
                const item = listitem.get_item();

                if (label instanceof Gtk.Label) {
                    label.set_label(item.display_name);
                }
            });

            return factory;
        }

        _init() {
            super._init();

            this._model = new LocationListModel();
            this._location = null;

            // Widgets
            this._entry = new Gtk.SearchEntry();

            this._entry.set_parent(this);
            this._entry.set_hexpand(true);
            this._popup = null;


            this._entry.connect("search-changed", (source) => {
                this.ensure_list_view();

                const text = source.get_text();

                if (text === null || text === '') {
                    this.cb?.(null);
                    this._filter?.set_search(null);
                    if (this._popup && this._popup.visible) {
                        this._popup.visible = false;
                    }
                    return;
                }
                if (this._popup && !this._popup.visible) {
                    this._popup.visible = true;
                    this._entry?.grab_focus();
                }

                this._filter?.set_search(text);
                this.cb?.(text);
            });

            this._model.fill();
        }

        _cleanup() {
            if (this._listview instanceof Gtk.ListView) {
                this._listview.set_model(null);
            }
        }

        get_location() {
            if (this._location)
                return this._location;
            else
                return null;
        }

        _set_location(location) {
            this._location = location;
            this.notify('location');
        }
    }
);

